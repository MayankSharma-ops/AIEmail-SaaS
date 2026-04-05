"use client";
import { Button } from "@/components/ui/button";
import {
  cancelSubscription,
  getSubscriptionStatus,
} from "@/lib/razorpay-actions";
import React from "react";
import { toast } from "sonner";
import { api } from "@/trpc/react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const PaymentButton = () => {
  const utils = api.useUtils();
  const [isSubscribed, setIsSubscribed] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const subscribed = await getSubscriptionStatus();
      setIsSubscribed(subscribed);
    })();
  }, []);

  // Load Razorpay checkout script
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error("Failed to load payment gateway. Please try again.");
        return;
      }

      // Create subscription on the server
      const res = await fetch("/api/razorpay/create-subscription", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to create subscription");
        return;
      }

      // Open Razorpay Checkout
      const options = {
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "AI Email SaaS",
        description: "Premium Subscription",
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          // Verify payment on the server
          const verifyRes = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });

          if (verifyRes.ok) {
            toast.success("Payment successful! Welcome to Premium!");
            setIsSubscribed(true);
            void utils.mail.getChatbotInteraction.invalidate();
          } else {
            toast.error("Payment verification failed. Please contact support.");
          }
        },
        theme: {
          color: "#3B82F6",
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false);
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManage = async () => {
    setIsLoading(true);
    try {
      await cancelSubscription();
      toast.success("Subscription cancelled successfully.");
      setIsSubscribed(false);
      void utils.mail.getChatbotInteraction.invalidate();
    } catch (error) {
      toast.error("Failed to cancel subscription.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = async () => {
    if (!isSubscribed) {
      await handleUpgrade();
    } else {
      await handleManage();
    }
  };

  return (
    <Button
      variant={"outline"}
      size="lg"
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading
        ? "Processing..."
        : isSubscribed
          ? "Cancel Subscription"
          : "Upgrade Plan"}
    </Button>
  );
};

export default PaymentButton;

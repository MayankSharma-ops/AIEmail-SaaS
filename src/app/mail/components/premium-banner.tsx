"use client";
import { motion } from "framer-motion";
import PaymentButton from "./payment-button";
import { api } from "@/trpc/react";
import { FREE_CREDITS_PER_DAY } from "@/app/constants";

const PremiumBanner = () => {
  const { data: chatbotInteraction } =
    api.mail.getChatbotInteraction.useQuery();
  const isSubscribed = chatbotInteraction?.isSubscribed ?? false;
  const remainingCredits = chatbotInteraction?.remainingCredits ?? 0;
  const dailyCredits = chatbotInteraction?.dailyCredits ?? FREE_CREDITS_PER_DAY;

  if (isSubscribed)
    return (
      <motion.div
        layout
        className="relative flex flex-col gap-4 overflow-hidden rounded-lg border bg-gray-900 p-4 md:flex-row"
      >
        <img
          src="/bot.webp"
          className="h-[180px] w-auto md:absolute md:-bottom-6 md:-right-10"
        />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-white">Premium Plan</h1>
            <p className="text-sm text-gray-400 md:max-w-[calc(100%-0px)]">
              {remainingCredits} / {dailyCredits} messages remaining
            </p>
          </div>
          <div className="h-2"></div>
          <p className="text-sm text-gray-400 md:max-w-[calc(100%-70px)]">
            Ask as many questions as you want
          </p>
          <div className="h-4"></div>
          <PaymentButton />
        </div>
      </motion.div>
    );

  return (
    <motion.div
      layout
      className="relative flex flex-col gap-4 overflow-hidden rounded-lg border bg-gray-900 p-4 md:flex-row"
    >
      <img
        src="/bot.webp"
        className="h-[180px] w-auto md:absolute md:-bottom-6 md:-right-10"
      />
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-white">Basic Plan</h1>
          <p className="text-sm text-gray-400 md:max-w-[calc(100%-0px)]">
            {remainingCredits} / {dailyCredits} messages remaining
          </p>
        </div>
        <div className="h-4"></div>
        <p className="text-sm text-gray-400 md:max-w-[calc(100%-150px)]">
          Upgrade to pro to ask as many questions as you want
        </p>
        <div className="h-4"></div>
        <PaymentButton />
      </div>
    </motion.div>
  );
};

export default PremiumBanner;

"use client";
import { useChat } from "ai/react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AnimatePresence } from "framer-motion";
import React from "react";
import { Send } from "lucide-react";
import { useLocalStorage } from "usehooks-ts";
import { cn } from "@/lib/utils";
import { SparklesIcon } from "@heroicons/react/24/solid";
import PaymentButton from "./payment-button";
import PremiumBanner from "./premium-banner";
import { toast } from "sonner";
import { PRO_CREDITS_PER_DAY } from "@/app/constants";

const transitionDebug = {
  type: "easeOut",
  duration: 0.2,
};
const AskAI = ({ isCollapsed }: { isCollapsed: boolean }) => {
  const [accountId] = useLocalStorage("accountId", "");
  const limitToastShownRef = React.useRef(false);
  const { input, handleInputChange, handleSubmit, messages, isLoading } =
    useChat({
      api: "/api/chat",
      body: {
        accountId,
      },
      onResponse: async (response) => {
        if (response.ok) return;

        if (response.status === 400) {
          toast.error("Select an account to ask AI questions.");
          return;
        }

        if (response.status === 401) {
          toast.error("Please sign in again to use AI chat.");
          return;
        }

        if (response.status === 429) {
          let payload: unknown = null;
          try {
            payload = await response.clone().json();
          } catch {
            // ignore
          }

          const isSubscribed = Boolean(
            payload && typeof payload === "object" && "isSubscribed" in payload
              ? (payload as { isSubscribed?: unknown }).isSubscribed
              : false,
          );

          limitToastShownRef.current = true;
          if (isSubscribed) {
            toast.error(
              `You have reached your daily limit. Please try again tomorrow.`,
            );
          } else {
            toast.error(
              `You have reached the free limit for today. Upgrade to Pro for ${PRO_CREDITS_PER_DAY} messages/day.`,
            );
          }
          setTimeout(() => {
            limitToastShownRef.current = false;
          }, 500);
          return;
        }
      },
      onError: (error) => {
        if (error.message.includes("Limit reached")) {
          if (limitToastShownRef.current) return;
          toast.error(
            "You have reached the daily limit for today. Please try again tomorrow.",
          );
          return;
        }
        toast.error("Chatbot request failed. Please try again.");
      },
      initialMessages: [],
    });
  React.useEffect(() => {
    const messageContainer = document.getElementById("message-container");
    if (messageContainer) {
      messageContainer.scrollTo({
        top: messageContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  if (isCollapsed) return null;
  return (
    <div className="mb-14 p-4">
      <PremiumBanner />
      <div className="h-4"></div>
      <motion.div className="flex flex-1 flex-col items-end justify-end rounded-lg border bg-gray-100 p-4 pb-4 shadow-inner dark:bg-gray-900">
        <div
          className="flex max-h-[50vh] w-full flex-col gap-2 overflow-y-scroll"
          id="message-container"
        >
          <AnimatePresence mode="wait">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                layout="position"
                className={cn(
                  "z-10 mt-2 max-w-[250px] break-words rounded-2xl bg-gray-200 dark:bg-gray-800",
                  {
                    "self-end text-gray-900 dark:text-gray-100":
                      message.role === "user",
                    "self-start bg-blue-500 text-white":
                      message.role === "assistant",
                  },
                )}
                layoutId={`container-[${messages.length - 1}]`}
                transition={transitionDebug}
              >
                <div className="px-3 py-2 text-[15px] leading-[15px]">
                  {message.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {messages.length > 0 && <div className="h-4"></div>}
        <div className="w-full">
          {messages.length === 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-4">
                <SparklesIcon className="size-6 text-gray-500" />
                <div>
                  <p className="text-gray-900 dark:text-gray-100">
                    Ask AI anything about your emails
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Get answers to your questions about your emails
                  </p>
                </div>
              </div>
              <div className="h-2"></div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  onClick={() =>
                    handleInputChange({
                      target: {
                        value: "What can I ask?",
                      },
                    })
                  }
                  className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-200"
                >
                  What can I ask?
                </span>
                <span
                  onClick={() =>
                    handleInputChange({
                      target: {
                        value: "When is my next flight?",
                      },
                    })
                  }
                  className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-200"
                >
                  When is my next flight?
                </span>
                <span
                  onClick={() =>
                    handleInputChange({
                      target: {
                        value: "When is my next meeting?",
                      },
                    })
                  }
                  className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-200"
                >
                  When is my next meeting?
                </span>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex w-full">
            <input
              type="text"
              onChange={handleInputChange}
              value={input}
              className="py- relative h-9 flex-grow rounded-full border border-gray-200 bg-white px-3 text-[15px] outline-none placeholder:text-[13px] placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-blue-500/20 focus-visible:ring-offset-1 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 dark:focus-visible:ring-blue-500/20 dark:focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-700"
              placeholder="Ask AI anything about your emails"
            />
            <motion.div
              key={messages.length}
              layout="position"
              className="pointer-events-none absolute z-10 flex h-9 w-[250px] items-center overflow-hidden break-words rounded-full bg-gray-200 [word-break:break-word] dark:bg-gray-800"
              layoutId={`container-[${messages.length}]`}
              transition={transitionDebug}
              initial={{ opacity: 0.6, zIndex: -1 }}
              animate={{ opacity: 0.6, zIndex: -1 }}
              exit={{ opacity: 1, zIndex: 1 }}
            >
              <div className="px-3 py-2 text-[15px] leading-[15px] text-gray-900 dark:text-gray-100">
                {input}
              </div>
            </motion.div>
            <button
              type="submit"
              disabled={!accountId || isLoading || !input.trim()}
              className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800"
            >
              <Send className="size-4 text-gray-500 dark:text-gray-300" />
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default AskAI;

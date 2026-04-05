import React, { type ComponentProps } from "react"
import DOMPurify from 'dompurify';
import { motion } from 'framer-motion'
import { format, formatDistanceToNow } from "date-fns"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useThread } from "@/app/mail/use-thread"
import useVim from "./kbar/use-vim"
import { useAutoAnimate } from "@formkit/auto-animate/react"
import useThreads from "../use-threads"
import { threadHasUnreadMessages } from "./thread-read-state";

export function ThreadList() {
  const { threads } = useThreads();

  const [threadId, setThreadId] = useThread();
  const [parent] = useAutoAnimate(/* optional config */);
  const { selectedThreadIds, visualMode } = useVim();

  const groupedThreads = threads?.reduce((acc, thread) => {
    const date = format(thread.lastMessageDate ?? new Date(), "yyyy-MM-dd");
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(thread);
    return acc;
  }, {} as Record<string, typeof threads>);

  return (
    <div className="max-w-full overflow-y-scroll max-h-[calc(100vh-120px)]">
      <div className="flex flex-col gap-2 p-4 pt-0" ref={parent}>
        {Object.entries(groupedThreads ?? {}).map(([date, threads]) => (
          <React.Fragment key={date}>
            <div className="text-xs font-medium text-muted-foreground mt-4 first:mt-0">
              {format(new Date(date), "MMMM d, yyyy")}
            </div>
            {threads.map((item) => {
              const isUnread = threadHasUnreadMessages(item);

              return (
                <button
                  id={`thread-${item.id}`}
                  key={item.id}
                  className={cn(
                    "relative flex flex-col items-start gap-2 overflow-hidden rounded-lg border p-3 text-left text-sm transition-all",
                    isUnread && "border-white/20 bg-white/[0.03]",
                    visualMode &&
                      selectedThreadIds.includes(item.id) &&
                      "bg-blue-200 dark:bg-blue-900"
                  )}
                  onClick={() => {
                    setThreadId(item.id);
                  }}
                >
                  {isUnread && (
                    <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-white" />
                  )}
                  {threadId === item.id && (
                    <motion.div
                      className="absolute inset-0 z-[-1] rounded-lg bg-black/10 dark:bg-white/20"
                      layoutId="thread-list-item"
                      transition={{
                        duration: 0.1,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                  <div className="flex w-full flex-col gap-1">
                    <div className="flex items-center">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "truncate text-foreground",
                            isUnread ? "font-semibold" : "font-medium"
                          )}
                        >
                          {item.emails.at(-1)?.from?.name}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "ml-auto text-xs",
                          isUnread
                            ? "font-semibold text-foreground"
                            : threadId === item.id
                              ? "text-foreground"
                              : "text-muted-foreground"
                        )}
                      >
                        {formatDistanceToNow(item.emails.at(-1)?.sentAt ?? new Date(), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "text-xs",
                        isUnread
                          ? "font-semibold text-foreground"
                          : "font-medium text-muted-foreground"
                      )}
                    >
                      {item.subject}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "text-xs line-clamp-2",
                      isUnread ? "text-foreground/80" : "text-muted-foreground"
                    )}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(item.emails.at(-1)?.bodySnippet ?? "", {
                        USE_PROFILES: { html: true },
                      }),
                    }}
                  ></div>
                  {item.emails[0]?.sysLabels.length ? (
                    <div className="flex items-center gap-2">
                      {item.emails.at(0)?.sysLabels.map((label) => (
                        <Badge
                          key={label}
                          variant={getBadgeVariantFromLabel(label)}
                        >
                          {label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function getBadgeVariantFromLabel(
  label: string
): ComponentProps<typeof Badge>["variant"] {
  if (["work"].includes(label.toLowerCase())) {
    return "default";
  }

  if (["personal"].includes(label.toLowerCase())) {
    return "outline";
  }

  return "secondary";
}

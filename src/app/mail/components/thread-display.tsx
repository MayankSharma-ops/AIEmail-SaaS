import {
  Archive,
  ArchiveX,
  Clock,
  Forward,
  MailOpen,
  MoreVertical,
  Reply,
  ReplyAll,
  Trash2,
} from "lucide-react"

import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { api, type RouterOutputs } from "@/trpc/react"
import { useQueryClient } from "@tanstack/react-query"
import { addDays, addHours, format, nextSaturday } from "date-fns"
import EmailDisplay from "./email-display"
import { useThread } from "../use-thread";
import useThreads from "../use-threads";
import { useAtom } from "jotai";
import { isSearchingAtom } from "./search-bar";
import SearchDisplay from "./search-display";
import ReplyBox from "./reply-box";
import { toast } from "sonner";
import { setThreadUnreadState, threadHasUnreadMessages } from "./thread-read-state";


export function ThreadDisplay() {
  const queryClient = useQueryClient()
  const utils = api.useUtils()
  const [threadId] = useThread()
  const { threads, accountId, queryKey, refetch } = useThreads()
  const today = new Date()
  const _thread = threads?.find(t => t.id === threadId)
  const [isSearching] = useAtom(isSearchingAtom)
  const { data: foundThread } = api.mail.getThreadById.useQuery({
    accountId: accountId,
    threadId: threadId ?? ''
  }, { enabled: !!accountId && !!!_thread && !!threadId })
  const thread = _thread ?? foundThread
  const isUnread = threadHasUnreadMessages(thread)
  const setReadStatus = api.mail.setReadStatus.useMutation({
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey })
      const previousData = queryClient.getQueryData<RouterOutputs['mail']['getThreads']>(queryKey)
      queryClient.setQueryData(queryKey, (data: RouterOutputs['mail']['getThreads'] | undefined) => {
        if (!data) return data

        return data.map((item) =>
          item.id === payload.threadId ? setThreadUnreadState(item, payload.unread) : item
        )
      })

      return { previousData }
    },
    onError: (_error, payload, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, context.previousData)
      }

      void utils.mail.getThreadById.invalidate({
        accountId,
        threadId: payload.threadId,
      })
      toast.error("Couldn't update the read status.")
    },
    onSuccess: (_data, payload) => {
      toast.success(payload.unread ? "Marked as unread." : "Marked as read.")
    },
    onSettled: async (_data, _error, payload) => {
      await Promise.all([
        refetch(),
        utils.mail.getThreadById.invalidate({
          accountId,
          threadId: payload.threadId,
        }),
      ])
    },
  })

  const handleReadToggle = () => {
    if (!thread || !accountId) return

    setReadStatus.mutate({
      accountId,
      threadId: thread.id,
      unread: !isUnread,
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center p-2">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <Archive className="w-4 h-4" />
                <span className="sr-only">Archive</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archive</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <ArchiveX className="w-4 h-4" />
                <span className="sr-only">Move to junk</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move to junk</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <Trash2 className="w-4 h-4" />
                <span className="sr-only">Move to trash</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move to trash</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Tooltip>
            <Popover>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={!thread}>
                    <Clock className="w-4 h-4" />
                    <span className="sr-only">Snooze</span>
                  </Button>
                </TooltipTrigger>
              </PopoverTrigger>
              <PopoverContent className="flex w-[535px] p-0">
                <div className="flex flex-col gap-2 px-2 py-4 border-r">
                  <div className="px-4 text-sm font-medium">Snooze until</div>
                  <div className="grid min-w-[250px] gap-1">
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      Later today{" "}
                      <span className="ml-auto text-muted-foreground">
                        {format(addHours(today, 4), "E, h:m b")}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      Tomorrow
                      <span className="ml-auto text-muted-foreground">
                        {format(addDays(today, 1), "E, h:m b")}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      This weekend
                      <span className="ml-auto text-muted-foreground">
                        {format(nextSaturday(today), "E, h:m b")}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      Next week
                      <span className="ml-auto text-muted-foreground">
                        {format(addDays(today, 7), "E, h:m b")}
                      </span>
                    </Button>
                  </div>
                </div>
                <div className="p-2">
                  <Calendar />
                </div>
              </PopoverContent>
            </Popover>
            <TooltipContent>Snooze</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 px-3"
                disabled={!thread}
                isLoading={setReadStatus.isPending}
                onClick={handleReadToggle}
              >
                <MailOpen className="w-4 h-4" />
                <span>Read / Unread</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isUnread ? "Mark as read" : "Mark as unread"}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <Reply className="w-4 h-4" />
                <span className="sr-only">Reply</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <ReplyAll className="w-4 h-4" />
                <span className="sr-only">Reply all</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply all</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <Forward className="w-4 h-4" />
                <span className="sr-only">Forward</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward</TooltipContent>
          </Tooltip>
        </div>
        <Separator orientation="vertical" className="h-6 mx-2" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!thread}>
              <MoreVertical className="w-4 h-4" />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Star thread</DropdownMenuItem>
            <DropdownMenuItem>Add label</DropdownMenuItem>
            <DropdownMenuItem>Mute thread</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator />
      {isSearching ? <SearchDisplay /> : <>

        {thread ? (
          <div className="flex flex-col flex-1 overflow-scroll">
            <div className="flex items-start p-4">
              <div className="flex items-start gap-4 text-sm">
                <Avatar>
                  <AvatarImage alt={'lol'} />
                  <AvatarFallback>
                    {thread?.emails[0]?.from?.name?.split(" ")
                      .map((chunk) => chunk[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="grid gap-1">
                  <div className="font-semibold">{thread.emails[0]?.from?.name}</div>
                  <div className="text-xs line-clamp-1">{thread.emails[0]?.subject}</div>
                  <div className="text-xs line-clamp-1">
                    <span className="font-medium">Reply-To:</span> {thread.emails[0]?.from?.address}
                  </div>
                </div>
              </div>
              {thread.emails[0]?.sentAt && (
                <div className="ml-auto text-xs text-muted-foreground">
                  {format(new Date(thread.emails[0].sentAt), "PPpp")}
                </div>
              )}
            </div>
            <Separator />
            <div className="max-h-[calc(100vh-500px)] overflow-scroll flex flex-col">
              <div className="p-6 flex flex-col gap-4">
                {thread.emails.map(email => {
                  return <EmailDisplay key={email.id} email={email} />
                })}
              </div>
            </div>
            <div className="flex-1"></div>
            <Separator className="mt-auto" />
            <ReplyBox />
          </div>
        ) : (
          <>
            <div className="p-8 text-center text-muted-foreground">
              No message selected {threadId}
            </div>
          </>
        )}
      </>}
    </div>
  )
}

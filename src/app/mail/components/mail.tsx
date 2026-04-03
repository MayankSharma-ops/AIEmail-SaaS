"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Separator } from "@/components/ui/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AccountSwitcher } from "@/app/mail/components/account-switcher"
import { ThreadDisplay } from "./thread-display"
import { ThreadList } from "./thread-list"
import { useLocalStorage } from "usehooks-ts"
import SideBar from "./sidebar"
import SearchBar, { isSearchingAtom } from "./search-bar"
import { useAtom } from "jotai"
import AskAI from "./ask-ai"
import { api } from "@/trpc/react"

interface MailProps {
  defaultLayout: number[] | undefined
  defaultCollapsed?: boolean
  navCollapsedSize: number
}

export function Mail({
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  navCollapsedSize,
}: MailProps) {
  const utils = api.useUtils()
  const [done, setDone] = useLocalStorage('normalhuman-done', false)
  const [accountId] = useLocalStorage('accountId', '')
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
  const syncAttemptedRef = React.useRef(new Set<string>())
  const { data: account } = api.mail.getMyAccount.useQuery(
    { accountId },
    { enabled: !!accountId }
  )
  const syncEmails = api.mail.syncEmails.useMutation()

  // Initial sync: runs once when account has no threads yet
  React.useEffect(() => {
    if (!accountId || !account) return
    if (account.threadCount > 0) return
    if (syncAttemptedRef.current.has(accountId)) return

    syncAttemptedRef.current.add(accountId)

    fetch('/api/initial-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accountId }),
    }).then(async (response) => {
      const payload = await response.json().catch(() => null)
      console.log('[mail] initial sync response', { accountId, status: response.status, payload })

      if (!response.ok) {
        syncAttemptedRef.current.delete(accountId)
        return
      }

      await Promise.all([
        utils.mail.getMyAccount.invalidate({ accountId }),
        utils.mail.getThreads.invalidate(),
        utils.mail.getNumThreads.invalidate(),
      ])
    }).catch((error) => {
      console.log('[mail] initial sync failed', { accountId, error })
      syncAttemptedRef.current.delete(accountId)
    })
  }, [account, accountId, utils.mail.getMyAccount, utils.mail.getNumThreads, utils.mail.getThreads])

  // Periodic delta sync: fetches new emails from Gmail every 60 seconds
  React.useEffect(() => {
    if (!accountId || !account) return
    if (account.threadCount === 0) return // wait for initial sync first

    const doSync = async () => {
      try {
        console.log('[mail] delta sync started', { accountId })
        await syncEmails.mutateAsync({ accountId })
        console.log('[mail] delta sync complete', { accountId })
        await Promise.all([
          utils.mail.getThreads.invalidate(),
          utils.mail.getNumThreads.invalidate(),
        ])
      } catch (error) {
        console.error('[mail] delta sync failed', { accountId, error })
      }
    }

    // Run immediately on mount, then every 60 seconds
    void doSync()
    const interval = setInterval(doSync, 60_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, account?.threadCount])


  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          document.cookie = `react-resizable-panels:layout:mail=${JSON.stringify(
            sizes
          )}`
        }}
        className="items-stretch h-full min-h-screen"
      >
        <ResizablePanel
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={15}
          maxSize={40}
          onCollapse={() => {
            setIsCollapsed(true)
            document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
              true
            )}`
          }}
          onResize={() => {
            setIsCollapsed(false)
            document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
              false
            )}`
          }}
          className={cn(
            isCollapsed &&
            "min-w-[50px] transition-all duration-300 ease-in-out"
          )}
        >
          <div className="flex flex-col h-full flex-1">
            <div
              className={cn(
                "flex h-[52px] items-center justify-center",
                isCollapsed ? "h-[52px]" : "px-2"
              )}
            >
              <AccountSwitcher isCollapsed={isCollapsed} />
            </div>
            <Separator />
            <SideBar isCollapsed={isCollapsed} />
            <div className="flex-1"></div>
            <AskAI isCollapsed={isCollapsed} />
          </div>

        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          <Tabs defaultValue="inbox" value={done ? 'done' : 'inbox'} onValueChange={tab => {
            if (tab === 'done') {
              setDone(true)
            } else {
              setDone(false)
            }
          }}>
            <div className="flex items-center px-4 py-2">
              <h1 className="text-xl font-bold">Inbox</h1>
              <TabsList className="ml-auto">
                <TabsTrigger
                  value="inbox"
                  className="text-zinc-600 dark:text-zinc-200"
                >
                  Inbox
                </TabsTrigger>
                <TabsTrigger
                  value="done"
                  className="text-zinc-600 dark:text-zinc-200"
                >
                  Done
                </TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <SearchBar />
            <TabsContent value="inbox" className="m-0">
              <ThreadList />
            </TabsContent>
            <TabsContent value="done" className="m-0">
              <ThreadList />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[2]} minSize={30}>
          <ThreadDisplay />
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  )
}

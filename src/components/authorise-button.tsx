'use client'
import { Button } from "@/components/ui/button"
import { getGoogleAuthUrlAction } from "@/app/mail/action"
import { api } from "@/trpc/react"
import { useLocalStorage } from "usehooks-ts"

export default function AuthoriseButton() {
    const syncEmails = api.mail.syncEmails.useMutation()
    const [accountId, setAccountId] = useLocalStorage('accountId', '')
    return <div className="flex flex-col gap-2">
        <Button size='sm' variant={'outline'} onClick={() => {
            if (!accountId) return
            syncEmails.mutate({ accountId })
        }}>
            Sync Emails
        </Button>
        <Button size='sm' variant={'outline'} onClick={async () => {
            const url = await getGoogleAuthUrlAction()
            window.location.href = url
        }}>
            Authorize Email
        </Button>
    </div>
}

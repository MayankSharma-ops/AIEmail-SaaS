import { api } from '@/trpc/react'
import { getQueryKey } from '@trpc/react-query'
import React from 'react'
import { useLocalStorage } from 'usehooks-ts'

const useThreads = () => {
    const { data: accounts } = api.mail.getAccounts.useQuery()
    const [accountId, setAccountId] = useLocalStorage('accountId', '')
    const [tab] = useLocalStorage('normalhuman-tab', 'inbox')
    const [done] = useLocalStorage('normalhuman-done', false)
    const resolvedAccountId = accounts?.some((account) => account.id === accountId)
        ? accountId
        : accounts?.[0]?.id ?? accountId

    React.useEffect(() => {
        if (!accounts?.length) return

        if (resolvedAccountId === accountId) return

        setAccountId(resolvedAccountId)
    }, [accounts, accountId, resolvedAccountId, setAccountId])

    const queryKey = getQueryKey(api.mail.getThreads, { accountId: resolvedAccountId, tab, done }, 'query')
    const { data: threads, isFetching, refetch } = api.mail.getThreads.useQuery({
        accountId: resolvedAccountId,
        done,
        tab
    }, { enabled: !!resolvedAccountId && !!tab, placeholderData: (e) => e, refetchInterval: 1000 * 5 })

    return {
        threads,
        isFetching,
        account: accounts?.find((account) => account.id === resolvedAccountId),
        refetch,
        accounts,
        queryKey,
        accountId: resolvedAccountId
    }
}

export default useThreads

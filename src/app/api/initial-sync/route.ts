import Account from "@/lib/account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

export const maxDuration = 300

export const POST = async (req: NextRequest) => {
    const body = await req.json()
    const { userId: bodyUserId, accountId } = body
    const { userId: authUserId } = await auth()
    const userId = authUserId ?? bodyUserId
    if (!accountId || !userId) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

    console.log('[initial-sync] start', { accountId, userId })

    const dbAccount = await db.account.findFirst({
        where: {
            id: accountId,
            userId,
        }
    })
    if (!dbAccount) return NextResponse.json({ error: "ACCOUNT_NOT_FOUND" }, { status: 404 });

    const account = new Account(dbAccount.token)
    await account.createSubscription()
    const response = await account.performInitialSync()
    if (!response) return NextResponse.json({ error: "FAILED_TO_SYNC" }, { status: 500 });

    const { deltaToken, emails } = response
    console.log('[initial-sync] fetched emails', { accountId, emailCount: emails.length, deltaToken })

    await syncEmailsToDatabase(emails, accountId)

    await db.account.update({
        where: {
            token: dbAccount.token,
        },
        data: {
            nextDeltaToken: deltaToken,
        },
    });
    console.log('[initial-sync] complete', { accountId, deltaToken })
    return NextResponse.json({ success: true, deltaToken }, { status: 200 });

}

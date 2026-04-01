import { getAccountDetails, getGoogleToken } from "@/lib/google";
import { waitUntil } from '@vercel/functions';
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server";
import axios from "axios";
import { type NextRequest, NextResponse } from "next/server";

export const GET = async (req: NextRequest) => {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const params = req.nextUrl.searchParams;
    const error = params.get('error');
    if (error) return NextResponse.json({ error: "Account connection failed" }, { status: 400 });

    const code = params.get('code');
    if (!code) return NextResponse.json({ error: "No code provided" }, { status: 400 });

    const tokens = await getGoogleToken(code as string);
    if (!tokens) return NextResponse.json({ error: "Failed to fetch token" }, { status: 400 });

    const accountDetails = await getAccountDetails(tokens);
    
    // We'll use the email as the account ID, or create a unique ID.
    const accountId = accountDetails.email; 
    
    const tokenString = JSON.stringify(tokens);

    await db.account.upsert({
        where: { id: accountId },
        create: {
            id: accountId,
            userId,
            token: tokenString,
            provider: 'Google',
            emailAddress: accountDetails.email,
            name: accountDetails.name
        },
        update: {
            token: tokenString,
        }
    });

    waitUntil(
        axios.post(`${process.env.NEXT_PUBLIC_URL}/api/initial-sync`, { accountId: accountId, userId }).then((res) => {
            console.log(res.data);
        }).catch((err) => {
            console.log(err.response?.data);
        })
    );

    return NextResponse.redirect(new URL('/mail', req.url));
};

import { auth } from "@clerk/nextjs/server";
import { waitUntil } from "@vercel/functions";
import { type NextRequest, NextResponse } from "next/server";

import {
  assertRequiredGoogleScopes,
  getAccountDetails,
  getGoogleToken,
} from "@/lib/google";
import { performInitialAccountSync } from "@/lib/initial-sync";
import { encryptGoogleAccountToken } from "@/lib/google-account-token";
import { db } from "@/server/db";

export const GET = async (req: NextRequest) => {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const error = params.get("error");
  if (error) {
    return NextResponse.json(
      { error: "Account connection failed" },
      { status: 400 },
    );
  }

  const code = params.get("code");
  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  const tokens = await getGoogleToken(code);
  if (!tokens) {
    return NextResponse.json(
      { error: "Failed to fetch token" },
      { status: 400 },
    );
  }

  assertRequiredGoogleScopes(tokens);

  const accountDetails = await getAccountDetails(tokens);
  if (!accountDetails.email) {
    return NextResponse.json(
      { error: "Google account email is unavailable." },
      { status: 400 },
    );
  }

  const accountId = accountDetails.email;
  const encryptedToken = encryptGoogleAccountToken(tokens);

  const existingAccount = await db.account.findUnique({
    where: { id: accountId },
    select: { userId: true },
  });

  if (existingAccount && existingAccount.userId !== userId) {
    return NextResponse.json(
      { error: "This Google account is already connected to another user." },
      { status: 409 },
    );
  }

  await db.account.upsert({
    where: { id: accountId },
    create: {
      id: accountId,
      userId,
      token: encryptedToken,
      provider: "Google",
      emailAddress: accountDetails.email,
      name: accountDetails.name,
    },
    update: {
      token: encryptedToken,
      provider: "Google",
      emailAddress: accountDetails.email,
      name: accountDetails.name,
      userId,
    },
  });

  waitUntil(
    performInitialAccountSync({ accountId, userId }).catch((syncError) => {
      console.error("[google.callback] initial sync failed", {
        accountId,
        userId,
        syncError,
      });
    }),
  );

  return NextResponse.redirect(new URL("/mail", req.url));
};

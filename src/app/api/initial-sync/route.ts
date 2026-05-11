import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { performInitialAccountSync } from "@/lib/initial-sync";

export const maxDuration = 300;

export const POST = async (req: NextRequest) => {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json();
  const accountId =
    body && typeof body === "object" && "accountId" in body
      ? (body as { accountId?: unknown }).accountId
      : undefined;

  if (typeof accountId !== "string" || accountId.length === 0) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  console.log("[initial-sync] start", { accountId, userId });

  try {
    const { deltaToken } = await performInitialAccountSync({
      accountId,
      userId,
    });

    console.log("[initial-sync] complete", { accountId, deltaToken });
    return NextResponse.json({ success: true, deltaToken }, { status: 200 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ACCOUNT_NOT_FOUND"
    ) {
      return NextResponse.json({ error: "ACCOUNT_NOT_FOUND" }, { status: 404 });
    }

    console.error("[initial-sync] failed", { accountId, userId, error });
    return NextResponse.json({ error: "FAILED_TO_SYNC" }, { status: 500 });
  }
};

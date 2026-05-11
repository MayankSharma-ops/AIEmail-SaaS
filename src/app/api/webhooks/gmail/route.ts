import { NextResponse, type NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";

import Account from "@/lib/account";
import { db } from "@/server/db";

export async function POST(req: NextRequest) {
  try {
    // 1. Basic Webhook Security (Validate secret token in URL if configured)
    const token = req.nextUrl.searchParams.get("token");
    if (process.env.GMAIL_WEBHOOK_SECRET && token !== process.env.GMAIL_WEBHOOK_SECRET) {
      console.warn("[webhooks.gmail] Unauthorized webhook attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse the Pub/Sub request payload
    const body = await req.json();
    if (!body.message || !body.message.data) {
      console.warn("[webhooks.gmail] Invalid payload structure.");
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 3. Decode the base64-encoded data
    const decodedData = Buffer.from(body.message.data, "base64").toString("utf-8");
    const payload = JSON.parse(decodedData);

    const emailAddress = payload.emailAddress;
    const historyId = payload.historyId;

    if (!emailAddress) {
      console.warn("[webhooks.gmail] Payload missing emailAddress.");
      return NextResponse.json({ error: "Missing emailAddress" }, { status: 400 });
    }

    console.log(`[webhooks.gmail] Received push notification for ${emailAddress} (historyId: ${historyId})`);

    // 4. Fetch the account from the database
    const dbAccount = await db.account.findUnique({
      where: { id: emailAddress },
      select: {
        id: true,
        token: true,
      },
    });

    if (!dbAccount) {
      console.warn(`[webhooks.gmail] Account ${emailAddress} not found in database.`);
      // Return 200 to prevent Google from retrying for a non-existent account
      return NextResponse.json({ success: true, message: "Account not found" });
    }

    // 5. Trigger the background sync
    waitUntil(
      (async () => {
        try {
          const account = await Account.fromStoredAccount(dbAccount);
          await account.syncEmails();
        } catch (error) {
          console.error(`[webhooks.gmail] Background sync failed for ${emailAddress}:`, error);
        }
      })()
    );

    // 6. Return immediate 200 OK so Google doesn't retry
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[webhooks.gmail] Error processing webhook:", error);
    // Return 200 to acknowledge receipt and prevent indefinite retries if it's a parsing error
    // In production with a robust queue, we might return 500 so Pub/Sub retries.
    return NextResponse.json({ success: false, error: "Internal Error" }, { status: 200 });
  }
}

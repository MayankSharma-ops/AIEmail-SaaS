import "server-only";

import Account from "@/lib/account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { db } from "@/server/db";

export async function performInitialAccountSync({
  accountId,
  userId,
}: {
  accountId: string;
  userId: string;
}) {
  const dbAccount = await db.account.findFirst({
    where: {
      id: accountId,
      userId,
    },
    select: {
      id: true,
      token: true,
    },
  });

  if (!dbAccount) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  const account = await Account.fromStoredAccount(dbAccount);
  await account.createSubscription();

  const response = await account.performInitialSync();
  if (!response) {
    throw new Error("FAILED_TO_SYNC");
  }

  await syncEmailsToDatabase(response.emails, accountId, {
    skipIndexing: true,
  });

  await db.account.update({
    where: {
      id: dbAccount.id,
    },
    data: {
      nextDeltaToken: response.deltaToken,
    },
  });

  return response;
}

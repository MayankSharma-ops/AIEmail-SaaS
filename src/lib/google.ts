import { google } from "googleapis";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { Credentials } from "google-auth-library";
import { OAuth2Client } from "google-auth-library";

import { FREE_ACCOUNTS_PER_USER, PRO_ACCOUNTS_PER_USER } from "@/app/constants";
import { db } from "@/server/db";

import { getSubscriptionStatus } from "./razorpay-actions";

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;

const GOOGLE_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export const getGoogleOAuthClient = () => {
  if (!process.env.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not set in environment variables");
  if (!process.env.GOOGLE_CLIENT_SECRET) throw new Error("GOOGLE_CLIENT_SECRET is not set in environment variables");
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ??
      `${process.env.NEXT_PUBLIC_URL}/api/google/callback`,
  );
};

export const getGoogleAuthorizationUrl = async () => {
  const { userId } = await auth();
  if (!userId) throw new Error("User not found");

  let user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    console.log("User not found in db, creating one...");
    const clerkUser = await currentUser();
    if (!clerkUser) throw new Error("User not found in Clerk");

    user = await db.user.upsert({
      where: { id: clerkUser.id },
      update: {
        emailAddress: clerkUser.emailAddresses[0]?.emailAddress ?? "",
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      },
      create: {
        id: clerkUser.id,
        emailAddress: clerkUser.emailAddresses[0]?.emailAddress ?? "",
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      },
      select: { role: true },
    });
  }

  const isSubscribed = await getSubscriptionStatus();
  const accounts = await db.account.count({ where: { userId } });

  if (user.role === "user") {
    if (isSubscribed) {
      if (accounts >= PRO_ACCOUNTS_PER_USER) {
        throw new Error(
          "You have reached the maximum number of accounts for your subscription",
        );
      }
    } else if (accounts >= FREE_ACCOUNTS_PER_USER) {
      throw new Error(
        "You have reached the maximum number of accounts for your subscription",
      );
    }
  }

  const oauth2Client = getGoogleOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: false,
    prompt: "consent",
    scope: [...GOOGLE_OAUTH_SCOPES],
  });
};

export const getGoogleToken = async (code: string): Promise<Credentials> => {
  const oauth2Client = getGoogleOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

export const assertRequiredGoogleScopes = (tokens: Credentials) => {
  const grantedScopes = new Set(
    tokens.scope
      ?.split(" ")
      .map((scope) => scope.trim())
      .filter(Boolean) ?? [],
  );

  const missingScopes = GOOGLE_REQUIRED_SCOPES.filter(
    (scope) => !grantedScopes.has(scope),
  );

  if (missingScopes.length > 0) {
    throw new Error(
      `Google account is missing required scopes: ${missingScopes.join(", ")}`,
    );
  }
};

export const getAccountDetails = async (tokens: Credentials) => {
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
  const userInfo = await oauth2.userinfo.get();

  return {
    email: userInfo.data.email || "",
    name: userInfo.data.name || "",
  };
};

import "server-only";

import crypto from "crypto";
import type { Credentials } from "google-auth-library";

import { db } from "@/server/db";

const TOKEN_VERSION = "v1";

type StoredGoogleAccount = {
  id: string;
  token: string;
};

const isLegacyPlaintextToken = (value: string) => value.trim().startsWith("{");

const getEncryptionSecret = () => {
  const secret = process.env.ACCOUNT_TOKEN_ENCRYPTION_KEY;
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return process.env.CLERK_SECRET_KEY ?? "dev-only-account-token-key";
  }

  throw new Error(
    "Missing ACCOUNT_TOKEN_ENCRYPTION_KEY. Configure it before running in production.",
  );
};

const getEncryptionKey = () =>
  crypto.createHash("sha256").update(getEncryptionSecret()).digest();

export const mergeGoogleCredentials = (
  current: Credentials,
  next: Credentials,
): Credentials => ({
  ...current,
  ...next,
  access_token: next.access_token ?? current.access_token ?? null,
  expiry_date: next.expiry_date ?? current.expiry_date ?? null,
  id_token: next.id_token ?? current.id_token ?? null,
  refresh_token: next.refresh_token ?? current.refresh_token ?? null,
  scope: next.scope ?? current.scope,
  token_type: next.token_type ?? current.token_type ?? null,
});

export const encryptGoogleAccountToken = (credentials: Credentials) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
};

export const decryptGoogleAccountToken = (value: string): Credentials => {
  if (isLegacyPlaintextToken(value)) {
    return JSON.parse(value) as Credentials;
  }

  const [version, iv, authTag, ciphertext] = value.split(".");
  if (
    version !== TOKEN_VERSION ||
    !iv ||
    !authTag ||
    !ciphertext
  ) {
    throw new Error("Invalid Google account token format.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(decrypted) as Credentials;
};

export const getGoogleCredentialsForAccount = async (
  account: StoredGoogleAccount,
) => {
  const credentials = decryptGoogleAccountToken(account.token);

  if (isLegacyPlaintextToken(account.token)) {
    await db.account.update({
      where: { id: account.id },
      data: { token: encryptGoogleAccountToken(credentials) },
    });
  }

  return credentials;
};

import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import type { Credentials, OAuth2Client } from "google-auth-library";

import { db } from "@/server/db";
import { syncEmailsToDatabase } from "./sync-to-db";
import type {
  EmailAddress,
  EmailAttachment,
  EmailMessage,
  SyncUpdatedResponse,
} from "@/lib/types";
import { getGoogleOAuthClient } from "./google";
import {
  encryptGoogleAccountToken,
  getGoogleCredentialsForAccount,
  mergeGoogleCredentials,
} from "./google-account-token";
import { redis } from "./redis";

const INITIAL_SYNC_MAX_EMAILS = 100;
const INITIAL_SYNC_PAGE_SIZE = 25;

type StoredGoogleAccount = {
  id: string;
  token: string;
};

type AccountWebhookRecord = {
  id: string;
  resource: string;
  notificationUrl: string;
  active: boolean;
  failSince?: string | null;
  failDescription?: string | null;
};

export default class Account {
  private readonly accountId: string;
  private token: Credentials;
  private readonly gmail: gmail_v1.Gmail;
  private readonly oauth2Client: OAuth2Client;

  private constructor({
    accountId,
    token,
  }: {
    accountId: string;
    token: Credentials;
  }) {
    this.accountId = accountId;
    this.token = token;
    this.oauth2Client = getGoogleOAuthClient();
    this.oauth2Client.setCredentials(this.token);
    this.oauth2Client.on("tokens", (tokens) => {
      void this.persistCredentials(tokens);
    });
    this.gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  static async fromStoredAccount(account: StoredGoogleAccount) {
    const token = await getGoogleCredentialsForAccount(account);
    return new Account({
      accountId: account.id,
      token,
    });
  }

  private async persistCredentials(next: Credentials) {
    if (Object.keys(next).length === 0) {
      return;
    }

    this.token = mergeGoogleCredentials(this.token, next);
    this.oauth2Client.setCredentials(this.token);

    await db.account.update({
      where: { id: this.accountId },
      data: {
        token: encryptGoogleAccountToken(this.token),
      },
    });
  }

  private async ensureFreshCredentials() {
    const accessToken = await this.oauth2Client.getAccessToken();

    if (!accessToken.token && !this.token.access_token) {
      throw new Error("Google access token unavailable for account.");
    }
  }

  private async parseMessage(
    message: gmail_v1.Schema$Message,
  ): Promise<EmailMessage> {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value || "";

    const fromStr = getHeader("from");
    const toStr = getHeader("to");
    const ccStr = getHeader("cc");
    const bccStr = getHeader("bcc");
    const subject = getHeader("subject");

    const parseAddress = (str: string): EmailAddress[] => {
      if (!str) return [];
      return str.split(",").map((s) => {
        const match = s.match(/(.*?)\s*<(.+?)>/);
        if (match) {
          return {
            name: match[1]?.trim().replace(/"/g, ""),
            address: match[2]!.trim(),
          };
        }
        return { name: s.trim(), address: s.trim() };
      });
    };

    const from = parseAddress(fromStr)[0] || { name: "", address: "" };

    const sysLabels: EmailMessage["sysLabels"] = [];
    if (message.labelIds?.includes("INBOX")) sysLabels.push("inbox");
    if (message.labelIds?.includes("SENT")) sysLabels.push("sent");
    if (message.labelIds?.includes("DRAFT")) sysLabels.push("draft");
    if (message.labelIds?.includes("TRASH")) sysLabels.push("trash");

    let body = "";
    if (message.payload?.parts) {
      const htmlPart = message.payload.parts.find(
        (p) => p.mimeType === "text/html",
      );
      const plainPart = message.payload.parts.find(
        (p) => p.mimeType === "text/plain",
      );
      const data = htmlPart?.body?.data || plainPart?.body?.data || "";
      body = Buffer.from(data, "base64").toString("utf-8");
    } else if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
    }

    const attachments: EmailAttachment[] = [];

    return {
      id: message.id!,
      threadId: message.threadId!,
      createdTime: new Date(
        parseInt(message.internalDate || "0"),
      ).toISOString(),
      lastModifiedTime: new Date(
        parseInt(message.internalDate || "0"),
      ).toISOString(),
      sentAt: new Date(
        getHeader("date") || parseInt(message.internalDate || "0"),
      ).toISOString(),
      receivedAt: new Date(parseInt(message.internalDate || "0")).toISOString(),
      internetMessageId: getHeader("message-id"),
      subject: subject || "(No Subject)",
      sysLabels,
      keywords: [],
      sysClassifications: [],
      sensitivity: "normal",
      from,
      to: parseAddress(toStr),
      cc: parseAddress(ccStr),
      bcc: parseAddress(bccStr),
      replyTo: parseAddress(getHeader("reply-to")),
      hasAttachments: false,
      body,
      bodySnippet: message.snippet || "",
      attachments,
      inReplyTo: getHeader("in-reply-to"),
      references: getHeader("references"),
      internetHeaders: [],
      nativeProperties: {},
      omitted: [],
    };
  }

  async getUpdatedEmails({
    pageToken,
    historyId,
    maxResults,
  }: {
    pageToken?: string;
    historyId?: string;
    maxResults?: number;
  }): Promise<SyncUpdatedResponse> {
    await this.ensureFreshCredentials();

    const records: EmailMessage[] = [];
    let nextToken = undefined;
    let nextHistoryId = historyId;

    if (historyId) {
      const res = await this.gmail.users.history.list({
        userId: "me",
        startHistoryId: historyId,
        historyTypes: ["messageAdded"],
        pageToken,
      });
      const histories = res.data.history || [];
      if (res.data.historyId) nextHistoryId = res.data.historyId;
      nextToken = res.data.nextPageToken;

      for (const h of histories) {
        if (h.messagesAdded) {
          for (const ma of h.messagesAdded) {
            if (ma.message?.id) {
              const msg = await this.gmail.users.messages.get({
                userId: "me",
                id: ma.message.id,
                format: "full",
              });
              records.push(await this.parseMessage(msg.data));
            }
          }
        }
      }
    } else {
      const res = await this.gmail.users.messages.list({
        userId: "me",
        pageToken,
        maxResults: maxResults ?? INITIAL_SYNC_PAGE_SIZE,
      });
      const messages = res.data.messages || [];
      nextToken = res.data.nextPageToken;
      console.log("[account.getUpdatedEmails] initial page", {
        pageToken: pageToken ?? null,
        requested: maxResults ?? INITIAL_SYNC_PAGE_SIZE,
        fetched: messages.length,
        hasNextPage: !!nextToken,
      });

      for (const m of messages) {
        if (m.id) {
          const msg = await this.gmail.users.messages.get({
            userId: "me",
            id: m.id,
            format: "full",
          });
          records.push(await this.parseMessage(msg.data));
          nextHistoryId = msg.data.historyId || nextHistoryId;
        }
      }
    }

    return {
      records,
      nextPageToken: nextToken || undefined,
      nextDeltaToken: nextHistoryId || historyId || "",
    };
  }

  async performInitialSync() {
    await this.ensureFreshCredentials();

    try {
      const profile = await this.gmail.users.getProfile({ userId: "me" });
      const baselineHistoryId = profile.data.historyId || "";

      let updatedResponse = await this.getUpdatedEmails({
        maxResults: INITIAL_SYNC_PAGE_SIZE,
      });
      let allEmails: EmailMessage[] = updatedResponse.records;
      console.log("[account.performInitialSync] fetched first batch", {
        emailCount: allEmails.length,
        hasNextPage: !!updatedResponse.nextPageToken,
      });

      while (
        updatedResponse.nextPageToken &&
        allEmails.length < INITIAL_SYNC_MAX_EMAILS
      ) {
        const remaining = INITIAL_SYNC_MAX_EMAILS - allEmails.length;
        updatedResponse = await this.getUpdatedEmails({
          pageToken: updatedResponse.nextPageToken,
          maxResults: Math.min(INITIAL_SYNC_PAGE_SIZE, remaining),
        });
        allEmails = allEmails.concat(updatedResponse.records);
        console.log("[account.performInitialSync] accumulated emails", {
          emailCount: allEmails.length,
          hasNextPage: !!updatedResponse.nextPageToken,
        });
      }

      return {
        emails: allEmails.slice(0, INITIAL_SYNC_MAX_EMAILS),
        deltaToken: baselineHistoryId,
      };
    } catch (error) {
      console.error("Error during initial sync:", error);
    }
  }

  async syncEmails() {
    const lockKey = `sync_lock:${this.accountId}`;
    if (redis) {
      const isLocked = await redis.set(lockKey, "1", { nx: true, ex: 120 });
      if (!isLocked) {
        console.log(`[account.syncEmails] Sync already in progress for ${this.accountId}, skipping...`);
        return;
      }
    }

    try {
      const activeAccount = await db.account.findUnique({
        where: { id: this.accountId },
        select: {
          id: true,
          nextDeltaToken: true,
        },
      });

    if (!activeAccount) throw new Error("Invalid account");

    if (!activeAccount.nextDeltaToken) {
      console.log("No delta token -> running initial sync");

      const initial = await this.performInitialSync();

      if (initial?.emails?.length) {
        await syncEmailsToDatabase(initial.emails, activeAccount.id, {
          skipIndexing: true,
        });
      }

      await db.account.update({
        where: { id: activeAccount.id },
        data: { nextDeltaToken: initial?.deltaToken },
      });

      return;
    }

    try {
      let response = await this.getUpdatedEmails({
        historyId: activeAccount.nextDeltaToken,
      });
      let allEmails: EmailMessage[] = response.records;
      let storedDeltaToken = response.nextDeltaToken;

      while (response.nextPageToken) {
        response = await this.getUpdatedEmails({
          historyId: activeAccount.nextDeltaToken,
          pageToken: response.nextPageToken,
        });
        allEmails = allEmails.concat(response.records);
        if (response.nextDeltaToken) {
          storedDeltaToken = response.nextDeltaToken;
        }
      }

      await syncEmailsToDatabase(allEmails, activeAccount.id);

      await db.account.update({
        where: { id: activeAccount.id },
        data: { nextDeltaToken: storedDeltaToken },
      });
    } catch (error: any) {
      const status = error?.response?.status ?? error?.code;
      const message = String(error?.message ?? "");

      if (status === 404 || message.toLowerCase().includes("history")) {
        console.warn(
          "[account.syncEmails] invalid historyId; re-running initial sync",
          {
            accountId: activeAccount.id,
            status,
            message,
          },
        );

        const initial = await this.performInitialSync();
        if (initial?.emails?.length) {
          await syncEmailsToDatabase(initial.emails, activeAccount.id, {
            skipIndexing: true,
          });
        }

        await db.account.update({
          where: { id: activeAccount.id },
          data: { nextDeltaToken: initial?.deltaToken },
        });
        return;
      }

      console.error("[account.syncEmails] delta sync failed", error);
      throw error;
    }
    } finally {
      if (redis) {
        await redis.del(lockKey);
      }
    }
  }

  async sendEmail({
    from,
    subject,
    body,
    inReplyTo,
    references,
    threadId,
    to,
    cc,
    bcc,
    replyTo,
  }: {
    from: EmailAddress;
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    replyTo?: EmailAddress;
  }) {
    await this.ensureFreshCredentials();

    try {
      const formatAddress = (addr: EmailAddress) =>
        addr.name ? `${addr.name} <${addr.address}>` : addr.address;

      const messageParts = [
        `From: ${formatAddress(from)}`,
        `To: ${to.map(formatAddress).join(", ")}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
      ];

      if (cc && cc.length)
        messageParts.push(`Cc: ${cc.map(formatAddress).join(", ")}`);
      if (bcc && bcc.length)
        messageParts.push(`Bcc: ${bcc.map(formatAddress).join(", ")}`);
      if (replyTo) messageParts.push(`Reply-To: ${formatAddress(replyTo)}`);
      if (inReplyTo) messageParts.push(`In-Reply-To: ${inReplyTo}`);
      if (references) messageParts.push(`References: ${references}`);
      messageParts.push("Content-Type: text/html; charset=utf-8");
      messageParts.push("");
      messageParts.push(body);

      const rawMessage = Buffer.from(messageParts.join("\r\n"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const res = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: rawMessage,
          threadId,
        },
      });
      return res.data;
    } catch (error) {
      console.error("Error sending email:", error);
      throw error;
    }
  }

  async createSubscription() {
    await this.ensureFreshCredentials();
    
    if (!process.env.GMAIL_PUBSUB_TOPIC) {
      console.warn("GMAIL_PUBSUB_TOPIC is not set. Skipping Pub/Sub setup.");
      return { success: false };
    }

    try {
      const res = await this.gmail.users.watch({
        userId: "me",
        requestBody: {
          labelIds: ["INBOX", "SENT"],
          labelFilterAction: "include",
          topicName: process.env.GMAIL_PUBSUB_TOPIC,
        },
      });
      console.log(`[account.createSubscription] Successfully created Pub/Sub watch for account ${this.accountId}:`, res.data);
      return { success: true, ...res.data };
    } catch (error) {
      console.error("[account.createSubscription] Failed to create Pub/Sub subscription:", error);
      throw error;
    }
  }

  async getWebhooks(): Promise<{ records: AccountWebhookRecord[] }> {
    await this.ensureFreshCredentials();
    return {
      records: [],
    };
  }

  async createWebhook(resource: string, notificationUrl: string) {
    await this.ensureFreshCredentials();
    console.warn("createWebhook is not implemented for Gmail.", {
      accountId: this.accountId,
      notificationUrl,
      resource,
    });
    return { success: false };
  }

  async deleteWebhook(webhookId: string) {
    await this.ensureFreshCredentials();
    console.warn("deleteWebhook is not implemented for Gmail.", {
      accountId: this.accountId,
      webhookId,
    });
    return { success: false };
  }
}

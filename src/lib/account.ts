import { google, gmail_v1 } from 'googleapis';
import { db } from '@/server/db';
import { syncEmailsToDatabase } from './sync-to-db';
import type { EmailMessage, EmailAddress, EmailAttachment, SyncUpdatedResponse } from '@/lib/types';
import { getGoogleOAuthClient } from './google';

export default class Account {
    private token: any;
    private gmail: gmail_v1.Gmail;

    constructor(token: string) {
        this.token = JSON.parse(token);
        const oauth2Client = getGoogleOAuthClient();
        oauth2Client.setCredentials(this.token);
        this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    }

    private async parseMessage(message: gmail_v1.Schema$Message): Promise<EmailMessage> {
        const headers = message.payload?.headers || [];
        const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        const fromStr = getHeader('from');
        const toStr = getHeader('to');
        const ccStr = getHeader('cc');
        const bccStr = getHeader('bcc');
        const subject = getHeader('subject');
        
        const parseAddress = (str: string): EmailAddress[] => {
            if (!str) return [];
            return str.split(',').map(s => {
                const match = s.match(/(.*?)\s*<(.+?)>/);
                if (match) {
                    return { name: match[1]?.trim().replace(/"/g, ''), address: match[2]!.trim() };
                }
                return { name: s.trim(), address: s.trim() };
            });
        };

        const from = parseAddress(fromStr)[0] || { name: '', address: '' };

        let sysLabels: any[] = [];
        if (message.labelIds?.includes('INBOX')) sysLabels.push('inbox');
        if (message.labelIds?.includes('SENT')) sysLabels.push('sent');
        if (message.labelIds?.includes('DRAFT')) sysLabels.push('draft');
        if (message.labelIds?.includes('TRASH')) sysLabels.push('trash');

        let body = '';
        if (message.payload?.parts) {
            const htmlPart = message.payload.parts.find(p => p.mimeType === 'text/html');
            const plainPart = message.payload.parts.find(p => p.mimeType === 'text/plain');
            const data = htmlPart?.body?.data || plainPart?.body?.data || '';
            body = Buffer.from(data, 'base64').toString('utf-8');
        } else if (message.payload?.body?.data) {
            body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
        }

        const attachments: EmailAttachment[] = [];
        // Optional: Implement attachments parsing if needed here

        return {
            id: message.id!,
            threadId: message.threadId!,
            createdTime: new Date(parseInt(message.internalDate || '0')).toISOString(),
            lastModifiedTime: new Date(parseInt(message.internalDate || '0')).toISOString(),
            sentAt: new Date(getHeader('date') || parseInt(message.internalDate || '0')).toISOString(),
            receivedAt: new Date(parseInt(message.internalDate || '0')).toISOString(),
            internetMessageId: getHeader('message-id'),
            subject: subject || '(No Subject)',
            sysLabels: sysLabels as any,
            keywords: [],
            sysClassifications: [],
            sensitivity: 'normal',
            from,
            to: parseAddress(toStr),
            cc: parseAddress(ccStr),
            bcc: parseAddress(bccStr),
            replyTo: parseAddress(getHeader('reply-to')),
            hasAttachments: false,
            body: body,
            bodySnippet: message.snippet || '',
            attachments,
            inReplyTo: getHeader('in-reply-to'),
            references: getHeader('references'),
            internetHeaders: [],
            nativeProperties: {},
            omitted: [],
        };
    }

    async getUpdatedEmails({ pageToken, historyId }: { pageToken?: string, historyId?: string }): Promise<SyncUpdatedResponse> {
        let records: EmailMessage[] = [];
        let nextToken = undefined;
        let nextHistoryId = historyId;

        if (historyId) {
            const res = await this.gmail.users.history.list({
                userId: 'me',
                startHistoryId: historyId,
                historyTypes: ['messageAdded'],
                pageToken,
            });
            const histories = res.data.history || [];
            if (res.data.historyId) nextHistoryId = res.data.historyId;
            nextToken = res.data.nextPageToken;

            for (const h of histories) {
                if (h.messagesAdded) {
                    for (const ma of h.messagesAdded) {
                        if (ma.message?.id) {
                            const msg = await this.gmail.users.messages.get({ userId: 'me', id: ma.message.id, format: 'full' });
                            records.push(await this.parseMessage(msg.data));
                        }
                    }
                }
            }
        } else {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const res = await this.gmail.users.messages.list({
                userId: 'me',
                pageToken,
                maxResults: 50,
            });
            const messages = res.data.messages || [];
            nextToken = res.data.nextPageToken;

            for (const m of messages) {
                if (m.id) {
                    const msg = await this.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
                    records.push(await this.parseMessage(msg.data));
                    nextHistoryId = msg.data.historyId || nextHistoryId;
                }
            }
        }

        return {
            records,
            nextPageToken: nextToken || undefined,
            nextDeltaToken: nextHistoryId || historyId || '',
        };
    }

    async performInitialSync() {
        try {
            let updatedResponse = await this.getUpdatedEmails({});
            let allEmails: EmailMessage[] = updatedResponse.records;
            let storedDeltaToken = updatedResponse.nextDeltaToken;

            while (updatedResponse.nextPageToken) {
                updatedResponse = await this.getUpdatedEmails({ pageToken: updatedResponse.nextPageToken });
                allEmails = allEmails.concat(updatedResponse.records);
                if (updatedResponse.nextDeltaToken) {
                    storedDeltaToken = updatedResponse.nextDeltaToken;
                }
            }

            return {
                emails: allEmails,
                deltaToken: storedDeltaToken,
            };
        } catch (error) {
            console.error('Error during initial sync:', error);
        }
    }

    async syncEmails() {
        const account = await db.account.findUnique({
            where: { token: JSON.stringify(this.token) }, // Or query by actual account ID from context
        });

        // Quick fallback if finding by strict string match fails
        const accounts = await db.account.findMany();
        const acc = accounts.find(a => {
            try {
                const t = JSON.parse(a.token);
                return t.access_token === this.token.access_token;
            } catch (e) { return false; }
        });

        const activeAccount = acc || account;

        if (!activeAccount) throw new Error("Invalid token or account");
        if (!activeAccount.nextDeltaToken) throw new Error("No delta token");

        let response = await this.getUpdatedEmails({ historyId: activeAccount.nextDeltaToken });
        let allEmails: EmailMessage[] = response.records;
        let storedDeltaToken = response.nextDeltaToken;

        while (response.nextPageToken) {
            response = await this.getUpdatedEmails({ historyId: activeAccount.nextDeltaToken, pageToken: response.nextPageToken });
            allEmails = allEmails.concat(response.records);
            if (response.nextDeltaToken) {
                storedDeltaToken = response.nextDeltaToken;
            }
        }

        try {
            await syncEmailsToDatabase(allEmails, activeAccount.id);
        } catch (error) {
            console.log('error', error);
        }

        await db.account.update({
            where: { id: activeAccount.id },
            data: { nextDeltaToken: storedDeltaToken }
        });
    }

    async sendEmail({
        from, subject, body, inReplyTo, references, threadId, to, cc, bcc, replyTo,
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
        try {
            const formatAddress = (addr: EmailAddress) => addr.name ? `${addr.name} <${addr.address}>` : addr.address;
            
            const messageParts = [
                `From: ${formatAddress(from)}`,
                `To: ${to.map(formatAddress).join(', ')}`,
                `Subject: ${subject}`,
                `MIME-Version: 1.0`,
            ];

            if (cc && cc.length) messageParts.push(`Cc: ${cc.map(formatAddress).join(', ')}`);
            if (bcc && bcc.length) messageParts.push(`Bcc: ${bcc.map(formatAddress).join(', ')}`);
            if (replyTo) messageParts.push(`Reply-To: ${formatAddress(replyTo)}`);
            if (inReplyTo) messageParts.push(`In-Reply-To: ${inReplyTo}`);
            if (references) messageParts.push(`References: ${references}`);
            messageParts.push('Content-Type: text/html; charset=utf-8');
            messageParts.push('');
            messageParts.push(body);

            const rawMessage = Buffer.from(messageParts.join('\r\n'))
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const res = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: rawMessage,
                    threadId
                }
            });
            return res.data;
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }

    async createSubscription() {
        const webhookUrl = process.env.NODE_ENV === 'development' ? 'https://potatoes-calculator-reports-crisis.trycloudflare.com' : process.env.NEXT_PUBLIC_URL;
        // In Gmail, you use watch() to get Pub/Sub notifications
        // Not implemented here for brevity, but this is the hook
        console.log('createSubscription is a stub for Gmail Pub/Sub setup.');
        return { success: true };
    }

    async getWebhooks() {
        // Return an empty array or mocked structure to satisfy TRPC routers looking for Aurinko webhooks
        return {
            records: []
        };
    }
}

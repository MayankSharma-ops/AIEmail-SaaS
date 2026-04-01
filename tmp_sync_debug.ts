import 'dotenv/config';
import { db } from './src/server/db';
import Account from './src/lib/account';

async function testSync() {
    const dbAccount = await db.account.findFirst();
    if (!dbAccount) {
        console.error("No account found in the database. Did you link your Gmail account successfully?");
        return;
    }
    console.log(`Testing sync for account: ${dbAccount.emailAddress}`);

    const account = new Account(dbAccount.token);
    
    console.log("Starting initial sync fetch...");
    const response = await account.performInitialSync();
    if (!response) {
        console.error("performInitialSync returned undefined.");
        return;
    }

    const { deltaToken, emails } = response;
    console.log(`Fetched ${emails.length} emails. Delta token: ${deltaToken}`);

    if (emails.length > 0) {
        console.log("First email preview:");
        console.log(JSON.stringify(emails[0], null, 2));

        // Let's try inserting the first one manually to see if Prisma fails
        const email = emails[0];
        try {
            console.log("To stringified:", JSON.stringify(email.to));
            // Just simulate the parsing to check for easy errors ...
            const isISO = (str: string) => !isNaN(Date.parse(str));
            console.log(`Validation - sentAt is ISO: ${isISO(email.sentAt)}`);
        } catch (e) {
            console.error("Validation failed", e);
        }
    } else {
        console.log("No emails fetched since 3 days ago. Are there any recent emails in the inbox?");
    }
}

testSync().then(() => console.log('Done')).catch(console.error);

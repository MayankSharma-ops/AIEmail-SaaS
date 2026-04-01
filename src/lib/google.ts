'use server'
import { google } from 'googleapis';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getSubscriptionStatus } from './stripe-actions';
import { db } from '@/server/db';
import { FREE_ACCOUNTS_PER_USER, PRO_ACCOUNTS_PER_USER } from '@/app/constants';
import { OAuth2Client } from 'google-auth-library';

export const getGoogleOAuthClient = () => {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_URL}/api/google/callback`
    );
};

export const getGoogleAuthorizationUrl = async () => {
    const { userId } = await auth();
    if (!userId) throw new Error('User not found');

    let user = await db.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });

    if (!user) {
        console.log('User not found in db, creating one...');
        const clerkUser = await currentUser();
        if (!clerkUser) throw new Error('User not found in Clerk');

        user = await db.user.upsert({
            where: { id: clerkUser.id },
            update: {
                emailAddress: clerkUser.emailAddresses[0]?.emailAddress ?? "",
                firstName: clerkUser.firstName,
                lastName: clerkUser.lastName,
                imageUrl: clerkUser.imageUrl
            },
            create: {
                id: clerkUser.id,
                emailAddress: clerkUser.emailAddresses[0]?.emailAddress ?? "",
                firstName: clerkUser.firstName,
                lastName: clerkUser.lastName,
                imageUrl: clerkUser.imageUrl
            },
            select: { role: true }
        });
    }

    const isSubscribed = await getSubscriptionStatus();
    const accounts = await db.account.count({ where: { userId } });

    if (user.role === 'user') {
        if (isSubscribed) {
            if (accounts >= PRO_ACCOUNTS_PER_USER) {
                throw new Error('You have reached the maximum number of accounts for your subscription');
            }
        } else {
            if (accounts >= FREE_ACCOUNTS_PER_USER) {
                throw new Error('You have reached the maximum number of accounts for your subscription');
            }
        }
    }

    const oauth2Client = getGoogleOAuthClient();
    
    const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent',
    });

    return url;
};

export const getGoogleToken = async (code: string) => {
    const oauth2Client = getGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
};

export const getAccountDetails = async (tokens: any) => {
    const oauth2Client = getGoogleOAuthClient();
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const userInfo = await oauth2.userinfo.get();
    
    return {
        email: userInfo.data.email || '',
        name: userInfo.data.name || ''
    };
};

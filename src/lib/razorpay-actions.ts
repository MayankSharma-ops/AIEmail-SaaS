'use server'

import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { razorpay } from "./razorpay";

export async function createRazorpaySubscription() {
    const { userId } = await auth();

    if (!userId) {
        throw new Error('User not found');
    }

    const subscription = await razorpay.subscriptions.create({
        plan_id: process.env.RAZORPAY_PLAN_ID!,
        total_count: 12,
        quantity: 1,
        notes: {
            userId: userId,
        },
    });

    return {
        subscriptionId: subscription.id,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    };
}

export async function cancelSubscription() {
    const { userId } = await auth();
    if (!userId) {
        return false;
    }
    const subscription = await db.subscription.findUnique({
        where: { userId: userId },
    });
    if (!subscription?.subscriptionId) {
        throw new Error('Subscription not found');
    }

    await razorpay.subscriptions.cancel(subscription.subscriptionId);

    await db.subscription.update({
        where: { userId: userId },
        data: {
            currentPeriodEnd: new Date(),
        },
    });

    return true;
}

export async function getSubscriptionStatus() {
    const { userId } = await auth();
    if (!userId) {
        return false;
    }
    const subscription = await db.subscription.findUnique({
        where: { userId: userId },
    });
    if (!subscription) {
        return false;
    }
    return subscription.currentPeriodEnd > new Date();
}

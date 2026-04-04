import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import crypto from "crypto";

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const {
            razorpay_payment_id,
            razorpay_subscription_id,
            razorpay_signature,
        } = await req.json();

        // Verify the payment signature
        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
            .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return NextResponse.json(
                { error: "Invalid payment signature" },
                { status: 400 }
            );
        }

        // Create subscription record in the database
        const subscription = await db.subscription.upsert({
            where: { userId: userId },
            create: {
                subscriptionId: razorpay_subscription_id,
                razorpayPaymentId: razorpay_payment_id,
                planId: process.env.RAZORPAY_PLAN_ID!,
                userId: userId,
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            },
            update: {
                subscriptionId: razorpay_subscription_id,
                razorpayPaymentId: razorpay_payment_id,
                planId: process.env.RAZORPAY_PLAN_ID!,
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        return NextResponse.json({
            message: "Payment verified successfully",
            subscriptionId: subscription.id,
        });
    } catch (error) {
        console.error("Error verifying payment:", error);
        return NextResponse.json(
            { error: "Payment verification failed" },
            { status: 500 }
        );
    }
}

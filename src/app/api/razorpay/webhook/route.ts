import { NextResponse } from "next/server";
import { db } from "@/server/db";
import crypto from "crypto";

export async function POST(req: Request) {
    try {
        const body = await req.text();
        const signature = req.headers.get("x-razorpay-signature");

        if (!signature) {
            return NextResponse.json({ error: "No signature" }, { status: 400 });
        }

        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
            .update(body)
            .digest("hex");

        if (expectedSignature !== signature) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }

        const event = JSON.parse(body);
        const eventType = event.event;

        console.log("Razorpay webhook event:", eventType);

        if (eventType === "subscription.activated") {
            const subscriptionData = event.payload.subscription.entity;
            const userId = subscriptionData.notes?.userId;

            if (!userId) {
                console.error("No userId in subscription notes");
                return NextResponse.json({ error: "No userId" }, { status: 400 });
            }

            await db.subscription.upsert({
                where: { userId: userId },
                create: {
                    subscriptionId: subscriptionData.id,
                    planId: subscriptionData.plan_id,
                    userId: userId,
                    currentPeriodEnd: new Date(subscriptionData.current_end * 1000),
                },
                update: {
                    subscriptionId: subscriptionData.id,
                    planId: subscriptionData.plan_id,
                    currentPeriodEnd: new Date(subscriptionData.current_end * 1000),
                },
            });
        }

        if (eventType === "subscription.charged") {
            const paymentData = event.payload.payment.entity;
            const subscriptionData = event.payload.subscription.entity;

            await db.subscription.update({
                where: { subscriptionId: subscriptionData.id },
                data: {
                    razorpayPaymentId: paymentData.id,
                    currentPeriodEnd: new Date(subscriptionData.current_end * 1000),
                },
            });
        }

        if (eventType === "subscription.cancelled" || eventType === "subscription.completed") {
            const subscriptionData = event.payload.subscription.entity;

            await db.subscription.update({
                where: { subscriptionId: subscriptionData.id },
                data: {
                    currentPeriodEnd: new Date(),
                },
            });
        }

        return NextResponse.json({ message: "success" }, { status: 200 });
    } catch (error) {
        console.error("Razorpay webhook error:", error);
        return NextResponse.json({ error: "Webhook error" }, { status: 500 });
    }
}

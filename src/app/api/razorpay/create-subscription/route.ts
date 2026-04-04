import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { razorpay } from "@/lib/razorpay";

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const subscription = await razorpay.subscriptions.create({
            plan_id: process.env.RAZORPAY_PLAN_ID!,
            total_count: 12,
            quantity: 1,
            notes: {
                userId: userId,
            },
        });

        return NextResponse.json({
            subscriptionId: subscription.id,
            keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
        });
    } catch (error) {
        console.error("Error creating Razorpay subscription:", error);
        return NextResponse.json(
            { error: "Failed to create subscription" },
            { status: 500 }
        );
    }
}

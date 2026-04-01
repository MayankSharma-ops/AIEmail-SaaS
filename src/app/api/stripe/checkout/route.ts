import type Stripe from 'stripe';
import { type NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/server/db';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
        return NextResponse.redirect(new URL('/pricing', request.url));
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['customer', 'subscription']
        });
        console.log(JSON.stringify(session, null, 2));
        if (!session.customer || typeof session.customer === 'string') {
            throw new Error('Invalid customer data from Stripe');
        }

        const customerId = session.customer.id
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

        if (!subscriptionId) {
            throw new Error('Invalid subscription data from Stripe');
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items.data.price.product'],
        });

        const plan = subscription.items.data[0]?.price;

        if (!plan) {
            throw new Error('No plan found for this subscription.');
        }

        const productId = (plan.product as Stripe.Product).id;

        if (!productId) {
            throw new Error('No product ID found for this subscription.');
        }

        const userId = session.client_reference_id;
        if (!userId) {
            throw new Error("No user ID found in session's client_reference_id.");
        }

        let user = await db.user.findUnique({
            where: { id: userId }
        })
        if (!user) {
            console.log('User not found in db, creating one...')
            const client = await clerkClient()
            const clerkUser = await client.users.getUser(userId)
            if (!clerkUser) throw new Error('User not found in Clerk')

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
                }
            })
        }

        const stripeSubscription = await db.stripeSubscription.create({
            data: {
                subscriptionId: subscriptionId,
                productId: productId,
                priceId: plan.id,
                customerId: customerId,
                userId,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000)
            }
        })

        return NextResponse.redirect(new URL('/mail', request.url));
    } catch (error) {
        console.error('Error processing checkout session:', error);
        return NextResponse.redirect(new URL('/error', request.url));
    }


}

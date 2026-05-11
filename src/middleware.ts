import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { enforceApiRateLimit } from "@/lib/rate-limit";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/privacy",
  "/terms-of-service",
  "/api/webhooks/clerk(.*)",
  "/api/razorpay/webhook(.*)",
]);

const isApiRoute = createRouteMatcher(["/api/(.*)"]);

export default clerkMiddleware(async (auth, req, event) => {
  const { userId } = auth();

  if (isApiRoute(req)) {
    const rateLimitResponse = await enforceApiRateLimit({
      req,
      userId,
      waitUntil: event.waitUntil.bind(event),
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  if (!isPublicRoute(req)) {
    auth().protect();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

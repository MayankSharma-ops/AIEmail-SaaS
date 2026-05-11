import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse, type NextRequest } from "next/server";

type RateLimitWindow = `${number} ${"s" | "m" | "h" | "d"}`;

type RateLimitRule = {
  key: string;
  matcher: RegExp;
  requests: number;
  window: RateLimitWindow;
};

const RATE_LIMIT_RULES: RateLimitRule[] = [
  {
    key: "chat",
    matcher: /^\/api\/chat$/,
    requests: 20,
    window: "1 m",
  },
  {
    key: "completion",
    matcher: /^\/api\/completion$/,
    requests: 30,
    window: "1 m",
  },
  {
    key: "google-callback",
    matcher: /^\/api\/google\/callback$/,
    requests: 10,
    window: "10 m",
  },
  {
    key: "initial-sync",
    matcher: /^\/api\/initial-sync$/,
    requests: 5,
    window: "10 m",
  },
  {
    key: "razorpay-create-subscription",
    matcher: /^\/api\/razorpay\/create-subscription$/,
    requests: 10,
    window: "1 m",
  },
  {
    key: "razorpay-verify",
    matcher: /^\/api\/razorpay\/verify$/,
    requests: 15,
    window: "5 m",
  },
  {
    key: "razorpay-webhook",
    matcher: /^\/api\/razorpay\/webhook$/,
    requests: 120,
    window: "1 m",
  },
  {
    key: "clerk-webhook",
    matcher: /^\/api\/webhooks\/clerk$/,
    requests: 120,
    window: "1 m",
  },
  {
    key: "nylas-callback",
    matcher: /^\/api\/auth\/callback\/nylas$/,
    requests: 10,
    window: "10 m",
  },
  {
    key: "trpc",
    matcher: /^\/api\/trpc(?:\/.*)?$/,
    requests: 120,
    window: "1 m",
  },
  {
    key: "default-api",
    matcher: /^\/api\/.*$/,
    requests: 60,
    window: "1 m",
  },
];

import { redis } from "./redis";

const rateLimiters = new Map<string, Ratelimit>();

const getRateLimitRule = (pathname: string) =>
  RATE_LIMIT_RULES.find((rule) => rule.matcher.test(pathname)) ??
  RATE_LIMIT_RULES[RATE_LIMIT_RULES.length - 1]!;

const getRateLimiter = (rule: RateLimitRule) => {
  const existing = rateLimiters.get(rule.key);
  if (existing) {
    return existing;
  }

  if (!redis) {
    throw new Error("Upstash Redis is not configured.");
  }

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(rule.requests, rule.window),
    analytics: true,
    prefix: `aiemail:${rule.key}`,
    ephemeralCache: new Map(),
  });

  rateLimiters.set(rule.key, ratelimit);
  return ratelimit;
};

const getClientIp = (req: NextRequest) =>
  req.ip ??
  req.headers.get("x-real-ip") ??
  req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .find(Boolean) ??
  "anonymous";

const createRateLimitHeaders = ({
  limit,
  remaining,
  reset,
}: {
  limit: number;
  remaining: number;
  reset: number;
}) => {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((reset - Date.now()) / 1000),
  );

  return {
    "Retry-After": retryAfterSeconds.toString(),
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": reset.toString(),
  };
};

export async function enforceApiRateLimit({
  req,
  userId,
  waitUntil,
}: {
  req: NextRequest;
  userId?: string | null;
  waitUntil?: (promise: Promise<unknown>) => void;
}) {
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return null;
  }

  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Rate limiting is not configured." },
        { status: 500 },
      );
    }

    return null;
  }

  const rule = getRateLimitRule(req.nextUrl.pathname);
  const identifier = `${rule.key}:${
    userId ? `user:${userId}` : `ip:${getClientIp(req)}`
  }`;
  const result = await getRateLimiter(rule).limit(identifier);

  if (waitUntil) {
    waitUntil(result.pending);
  }

  if (result.success) {
    return null;
  }

  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: createRateLimitHeaders(result),
    },
  );
}

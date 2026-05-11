import { Redis } from "@upstash/redis";

const hasUpstashCredentials = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

export const redis = hasUpstashCredentials ? Redis.fromEnv() : null;

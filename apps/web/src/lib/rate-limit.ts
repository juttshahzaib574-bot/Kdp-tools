import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Falls back to "allow everything" when Upstash isn't configured (local dev
// without a Redis instance) so the app is still usable, but logs a warning —
// this must never be silently disabled in production.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const ratelimit =
  redisUrl && redisToken
    ? new Ratelimit({
        redis: new Redis({ url: redisUrl, token: redisToken }),
        limiter: Ratelimit.slidingWindow(10, "60 s"),
        analytics: true,
        prefix: "kdp:ratelimit",
      })
    : null;

if (!ratelimit && process.env.NODE_ENV === "production") {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting is DISABLED in production.",
  );
}

export async function checkRateLimit(identifier: string) {
  if (!ratelimit) {
    return { success: true, limit: Infinity, remaining: Infinity };
  }
  return ratelimit.limit(identifier);
}

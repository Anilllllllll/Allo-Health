import { Redis } from "@upstash/redis";

// ============================================================
// Upstash Redis Client
// ============================================================
// REST-based Redis client — works in serverless environments
// (Vercel Functions, Edge) without persistent TCP connections.
//
// Used for:
//   - Idempotency key caching (fast lookups)
//   - Rate limiting (future)
//
// If Redis env vars are missing, idempotency is silently
// disabled — the app still works, just without deduplication.
// ============================================================

let redis: Redis | null = null;

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export { redis };

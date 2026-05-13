import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

// ============================================================
// Idempotency Middleware
// ============================================================
//
// PURPOSE:
//   Prevent duplicate side effects when a client retries a request.
//   Example: User's network glitches during "Reserve" → browser retries
//   → without idempotency, TWO reservations are created for ONE click.
//
// HOW IT WORKS:
//   1. Client sends `Idempotency-Key: <unique-string>` header
//   2. Server checks Redis: does this key exist?
//      - YES → return the cached response (no side effect)
//      - NO  → execute the handler, cache the response, return it
//
// REDIS KEY FORMAT:
//   `idempotency:<key>` → JSON { statusCode, body }
//   TTL: 24 hours (auto-deleted after that)
//
// GRACEFUL DEGRADATION:
//   - No Idempotency-Key header? → skip, execute normally
//   - Redis not configured?       → skip, execute normally
//   - Redis connection fails?     → skip, execute normally (log error)
//
// ============================================================

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

interface CachedResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

/**
 * Wraps a route handler with idempotency support.
 *
 * Usage in a route handler:
 *   export async function POST(request: NextRequest) {
 *     return withIdempotency(request, async () => {
 *       // your actual logic here
 *       return NextResponse.json(data, { status: 201 });
 *     });
 *   }
 */
export async function withIdempotency(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  // ── Step 1: Extract the Idempotency-Key header ──
  const idempotencyKey = request.headers.get("idempotency-key");

  // No key provided? Execute normally (idempotency is opt-in)
  if (!idempotencyKey) {
    return handler();
  }

  // Redis not configured? Execute normally
  if (!redis) {
    console.log("[Idempotency] Redis not configured, skipping");
    return handler();
  }

  const redisKey = `idempotency:${idempotencyKey}`;

  // ── Step 2: Check if we've seen this key before ──
  try {
    const cached = await redis.get<CachedResponse>(redisKey);

    if (cached) {
      // We've already processed this request — return the cached response
      // WITHOUT executing the handler again (no duplicate side effect)
      console.log(`[Idempotency] Cache HIT for key: ${idempotencyKey}`);
      return NextResponse.json(cached.body, {
        status: cached.statusCode,
        headers: {
          "X-Idempotency-Status": "cached",
          "X-Idempotency-Key": idempotencyKey,
        },
      });
    }
  } catch (error) {
    // Redis is down? Log and continue without idempotency
    console.error("[Idempotency] Redis read error:", error);
    return handler();
  }

  // ── Step 3: Execute the handler (first time for this key) ──
  const response = await handler();

  // ── Step 4: Cache the response in Redis ──
  try {
    // Clone the response to read the body without consuming it
    const clonedResponse = response.clone();
    const body = await clonedResponse.json();

    const cacheEntry: CachedResponse = {
      statusCode: response.status,
      body,
    };

    // Store in Redis with 24h TTL
    // `set` with `ex` = "expire after N seconds"
    await redis.set(redisKey, cacheEntry, { ex: IDEMPOTENCY_TTL_SECONDS });

    console.log(`[Idempotency] Cached response for key: ${idempotencyKey}`);
  } catch (error) {
    // Failed to cache? That's OK — the response still goes through
    // Next retry will just re-execute (acceptable degradation)
    console.error("[Idempotency] Redis write error:", error);
  }

  // ── Step 5: Return the original response with idempotency headers ──
  // We create a new response to ensure headers are properly set
  // (NextResponse headers can be immutable in some contexts)
  const originalBody = await response.clone().json();
  return NextResponse.json(originalBody, {
    status: response.status,
    headers: {
      "X-Idempotency-Status": "executed",
      "X-Idempotency-Key": idempotencyKey,
    },
  });
}

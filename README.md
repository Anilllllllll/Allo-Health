# Allo Health — Inventory Reservation System

A production-grade inventory reservation system built for e-commerce, demonstrating **concurrency-safe stock management** using PostgreSQL row-level locking.

**Live URL:** [https://allo-health.vercel.app](https://allo-health.vercel.app)

## 🎯 Problem Statement

When a customer reaches checkout, payment can take several minutes (3DS flows, UPI confirmations, wallet redirects). During that window, thousands of other shoppers may be looking at the same product. If we decrement stock only at payment time, two customers can pay for the same physical unit. If we decrement at add-to-cart, inventory appears depleted even though 80% of carts are abandoned.

**The solution is a reservation:** when a customer proceeds to checkout, we temporarily hold the units for 10 minutes. If payment succeeds, we confirm the reservation and the stock is permanently decremented. If payment fails or the timer runs out, we release the hold so the units become available again.

The **core challenge**: if two requests come in simultaneously for the last unit of a SKU, exactly one should succeed and the other should get a 409. This is solved using `SELECT ... FOR UPDATE` within PostgreSQL transactions.

## 🏗️ Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend   │────▶│  Next.js Route   │────▶│    Supabase      │
│  React Query │     │    Handlers      │     │   PostgreSQL     │
│  shadcn/ui   │     │  (API Layer)     │     │  (Row Locking)   │
│  Tailwind    │     │                  │     │                  │
└──────────────┘     └──────────────────┘     └──────────────────┘
                            │                         │
                     ┌──────▼──────┐          ┌───────▼────────┐
                     │   Upstash   │          │  CHECK         │
                     │   Redis     │          │  Constraint    │
                     │ (Idempotency│          │  reservedUnits │
                     │  + Caching) │          │  <= totalUnits │
                     └─────────────┘          └────────────────┘
```

## 🔧 Tech Stack

| Layer      | Technology                        |
| ---------- | --------------------------------- |
| Frontend   | Next.js 15 App Router, React 19   |
| Styling    | Tailwind CSS v4, shadcn/ui        |
| State      | React Query (TanStack Query)      |
| Backend    | Next.js Route Handlers            |
| ORM        | Prisma v7 + PrismaPg Adapter      |
| Database   | Supabase PostgreSQL (hosted)      |
| Validation | Zod                               |
| Caching    | Upstash Redis                     |
| Deployment | Vercel                            |

## 📦 Data Model

Five relational models in PostgreSQL:

- **Product** — SKU, name, price, description, imageUrl
- **Warehouse** — Name, location
- **Stock** — Per-warehouse inventory (`totalUnits`, `reservedUnits`), composite unique on `(productId, warehouseId)`
- **Reservation** — Status: `PENDING` → `CONFIRMED` | `RELEASED` | `EXPIRED`, with `expiresAt` timestamp
- **IdempotencyKey** — Stores request hash → response mapping to prevent duplicate side effects

### Critical Database Constraint

```sql
ALTER TABLE "Stock"
ADD CONSTRAINT stock_reserved_check
CHECK ("reservedUnits" >= 0 AND "reservedUnits" <= "totalUnits");
```

This DB-level CHECK constraint is the last line of defense against overselling — even if application logic has a bug, PostgreSQL will reject any UPDATE that would make `reservedUnits > totalUnits`.

## 🔒 Concurrency Strategy

The reservation endpoint uses `SELECT ... FOR UPDATE` inside an interactive Prisma transaction:

```sql
BEGIN TRANSACTION (READ COMMITTED);

  -- Step 1: Lock the stock row
  SELECT * FROM "Stock"
  WHERE "productId" = $1 AND "warehouseId" = $2
  FOR UPDATE;

  -- Step 2: Check availability
  -- If available < requested → ROLLBACK → HTTP 409

  -- Step 3: Increment reserved count
  UPDATE "Stock" SET "reservedUnits" = "reservedUnits" + $3;

  -- Step 4: Create reservation
  INSERT INTO "Reservation" (...);

COMMIT; -- Lock released
```

**How it prevents overselling:** When two concurrent requests hit the same stock row:
1. Request A acquires the row-level lock via `FOR UPDATE`
2. Request B **waits** (blocks) until A's transaction commits
3. A commits → `reservedUnits` is incremented
4. B acquires the lock → sees the updated `reservedUnits` → calculates `available < requested` → throws `InsufficientStockError` → returns HTTP 409

**Why `ReadCommitted` + `FOR UPDATE` instead of `Serializable`?**
- `Serializable` isolation causes PostgreSQL to proactively abort transactions under high contention (false-positive serialization failures), even when `FOR UPDATE` would have correctly serialized them.
- `ReadCommitted` + `FOR UPDATE` gives us the exact locking behavior we need: queue concurrent requests on the same row, let each see the latest committed data after acquiring the lock.

### Verified with test:

```bash
npm run test:concurrency
# 50 parallel requests → 1 stock unit
# Result: 1 success (201), 49 conflicts (409), 0 errors
```

## ⏳ Reservation Expiry

Reservations that aren't confirmed within `RESERVATION_TTL_MINUTES` (default: 10 minutes) are automatically released so units return to available stock. We use a **two-layer approach**:

### Layer 1: Lazy Expiry on Confirm (Real-time)

When a user clicks "Confirm Purchase", the `confirmReservation()` service checks `expiresAt`:
- If `expiresAt < now`: the reservation is marked `EXPIRED`, `reservedUnits` is decremented, and the API returns **HTTP 410 Gone**.
- This ensures expired reservations are caught instantly when a user tries to confirm after the timer runs out.

```typescript
// lib/reservations/service.ts — confirmReservation()
if (new Date(reservation.expiresAt) < new Date()) {
  await tx.stock.update({ data: { reservedUnits: { decrement: quantity } } });
  await tx.reservation.update({ data: { status: "EXPIRED" } });
  throw new ReservationExpiredError(); // → HTTP 410
}
```

### Layer 2: Vercel Cron Job (Bulk Cleanup)

A Vercel Cron job runs every 5 minutes (`vercel.json`) and calls `POST /api/cron`:
- Finds all `PENDING` reservations where `expiresAt < now`
- For each, acquires a row-level lock, decrements `reservedUnits`, and marks the reservation `EXPIRED`
- This catches "abandoned" reservations where the user never returned to confirm or cancel

```json
// vercel.json
{ "crons": [{ "path": "/api/cron", "schedule": "*/5 * * * *" }] }
```

### Why two layers?

| Scenario | Layer 1 (Lazy) | Layer 2 (Cron) |
|----------|----------------|----------------|
| User clicks Confirm after timer | ✅ Catches immediately | — |
| User abandons checkout entirely | — | ✅ Catches within 5 min |
| User closes browser | — | ✅ Catches within 5 min |

This ensures no reservation blocks stock for more than `TTL + 5 minutes` in the worst case.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Supabase account ([supabase.com](https://supabase.com)) — free tier works
- Upstash Redis account ([upstash.com](https://upstash.com)) — free tier works

### Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/Anilllllllll/Allo-Health.git
cd Allo-Health

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in your Supabase and Upstash credentials (see below)

# 4. Run the migration SQL in Supabase SQL Editor
# Open prisma/migration.sql → copy all → Supabase Dashboard → SQL Editor → Run

# 5. Generate Prisma client
npx prisma generate

# 6. Seed the database
npm run db:seed

# 7. Start development server
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase pooled connection string (port 6543) |
| `DIRECT_URL` | Supabase direct connection (for Prisma CLI) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `RESERVATION_TTL_MINUTES` | Reservation expiry time (default: 10) |
| `CRON_SECRET` | Bearer token for Vercel Cron authentication |

## 📁 Project Structure

```
allo/
├── app/
│   ├── api/
│   │   ├── products/route.ts          # GET /api/products
│   │   ├── warehouses/route.ts        # GET /api/warehouses
│   │   ├── reservations/
│   │   │   ├── route.ts               # GET + POST /api/reservations
│   │   │   └── [id]/
│   │   │       ├── confirm/route.ts   # POST confirm
│   │   │       └── release/route.ts   # POST release
│   │   └── cron/route.ts             # POST /api/cron (Vercel Cron)
│   ├── reservations/page.tsx          # Reservation management page
│   ├── layout.tsx                     # Root layout (QueryProvider, Toaster)
│   └── page.tsx                       # Product listing page
├── lib/
│   ├── db.ts                          # Prisma client singleton (PrismaPg adapter)
│   ├── redis.ts                       # Upstash Redis client
│   ├── errors.ts                      # Custom error hierarchy (409, 410, 404, 429)
│   └── reservations/service.ts        # Core business logic (FOR UPDATE locking)
├── components/
│   ├── product-grid.tsx               # Product cards with stock levels
│   ├── reservation-panel.tsx          # Checkout panel with countdown timer
│   └── ui/                            # shadcn/ui components
├── hooks/
│   └── use-reservations.ts            # React Query hooks for all API operations
├── schemas/
│   └── reservation.ts                 # Zod validation schemas
├── prisma/
│   ├── schema.prisma                  # Database schema (5 models)
│   ├── seed.ts                        # Seed script (5 products, 3 warehouses)
│   └── migration.sql                  # SQL migration for Supabase SQL Editor
├── tests/
│   ├── concurrency.ts                 # 50-parallel concurrency proof
│   └── verify-all.ts                  # Full verification suite (58 assertions)
└── vercel.json                        # Vercel Cron config
```

## 🧪 Testing

```bash
# Full verification suite (58 assertions across 13 test groups)
npm run db:seed && npx tsx tests/verify-all.ts

# 50-parallel concurrency test
npm run db:seed && npm run test:concurrency
```

### Concurrency Test Results

```
═══════════════════════════════════════════════════════
  CONCURRENCY TEST — Inventory Reservation System
═══════════════════════════════════════════════════════
  ✅ Successes (201):  1
  ❌ Conflicts (409):  49
  ⏱  Total time:      2706ms

  POST-TEST STOCK STATE:
  Total:    1, Reserved: 1, Available: 0

  ✅ TEST PASSED — No overselling detected!
═══════════════════════════════════════════════════════
```

## 📝 API Endpoints

| Method | Path | Behaviour | Error Codes |
| ------ | ---- | --------- | ----------- |
| GET | `/api/products` | List products with available stock per warehouse | — |
| GET | `/api/warehouses` | List warehouses | — |
| GET | `/api/reservations` | List recent reservations with product/warehouse details | — |
| POST | `/api/reservations` | Reserve units for a product/warehouse | 400, 409 |
| POST | `/api/reservations/:id/confirm` | Confirm reservation (payment succeeded) | 400, 410 |
| POST | `/api/reservations/:id/release` | Release reservation (payment failed / user cancelled) | 400 |
| POST | `/api/cron` | Expire stale reservations (Vercel Cron) | 401 |

## ⚖️ Trade-offs & Design Decisions

### What I chose and why

1. **`ReadCommitted` + `FOR UPDATE` over `Serializable` isolation**
   - `Serializable` caused false-positive transaction aborts under high contention. `FOR UPDATE` already provides the exact locking semantics we need — serializing concurrent access to the same stock row.

2. **Prisma v7 with `@prisma/adapter-pg`**
   - Prisma v7 dropped built-in connection handling in favor of driver adapters. This required installing `@prisma/adapter-pg` and `pg`, but gives us raw SQL access for `SELECT ... FOR UPDATE` via `$queryRaw`.

3. **Supabase transaction pooler (port 6543) instead of direct connection**
   - The Supabase direct host uses IPv6-only, which is inaccessible from many networks. The transaction pooler works reliably and supports interactive transactions.

4. **DB-level CHECK constraint as safety net**
   - Even if the application logic has a bug, the database will reject any UPDATE that would make `reservedUnits > totalUnits`. Defense in depth.

5. **Two-layer expiry (lazy + cron) instead of just one**
   - Lazy expiry gives instant feedback when confirming. Cron catches abandoned checkouts. Together they ensure no reservation blocks stock indefinitely.

6. **Idempotency via Upstash Redis (Bonus)**
   - The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints are wrapped with a `withIdempotency()` middleware. If the client sends an `Idempotency-Key` header, the server checks Redis for a cached response. On cache hit, it returns the original response without re-executing the side effect. On cache miss, it executes normally and caches the response with a 24-hour TTL. If Redis is unavailable, the middleware degrades gracefully — the request executes normally without deduplication.

### What I'd do differently with more time

1. **Optimistic UI updates** — Currently the UI waits for the server response before updating. With optimistic updates via React Query's `onMutate`, the UI would feel snappier.

2. **WebSocket / Server-Sent Events for real-time stock** — Currently stock levels refresh on a 10-second stale timer. Real-time updates via WebSocket would show stock changes instantly across all connected users.

3. **Rate limiting** — The `RateLimitError` class exists but no actual rate limiting middleware is implemented. I'd use Upstash Redis with a sliding window rate limiter.

4. **Database connection pooling** — For production, I'd configure PgBouncer or Supabase's connection pooler more carefully, with appropriate pool sizes for the expected concurrent load.

5. **E2E tests with Playwright** — The current tests are API-level. E2E tests would verify the full user flow: browse → reserve → see countdown → confirm/cancel.

## 📄 License

MIT

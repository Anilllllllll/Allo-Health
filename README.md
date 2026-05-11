# Allo Health — Inventory Reservation System

A production-grade inventory reservation system built for e-commerce, demonstrating **concurrency-safe stock management** using PostgreSQL row-level locking.

## 🎯 Problem Statement

When two users try to reserve the last item simultaneously, exactly **one request must succeed** and the other must return **HTTP 409 Conflict**. This system solves overselling using `SELECT ... FOR UPDATE` within PostgreSQL transactions.

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
| Database   | Supabase PostgreSQL               |
| Validation | Zod                               |
| Caching    | Upstash Redis                     |
| Deployment | Vercel                            |

## 📦 Database Models

- **Product** — SKU, name, price, description
- **Warehouse** — Name, location
- **Stock** — Per-warehouse inventory (`totalUnits`, `reservedUnits`)
- **Reservation** — Status: `PENDING` → `CONFIRMED` | `RELEASED` | `EXPIRED`
- **IdempotencyKey** — Prevents duplicate reservation requests

### Critical Constraint

```sql
ALTER TABLE "Stock"
ADD CONSTRAINT stock_reserved_check
CHECK ("reservedUnits" >= 0 AND "reservedUnits" <= "totalUnits");
```

This DB-level constraint is the last line of defense against overselling — even if application logic has a bug.

## 🔒 Concurrency Strategy

```sql
BEGIN TRANSACTION;
  SELECT * FROM "Stock"
  WHERE "productId" = $1 AND "warehouseId" = $2
  FOR UPDATE;                    -- Row-level lock acquired

  -- Check: available = totalUnits - reservedUnits
  -- If available < requested: ROLLBACK → HTTP 409

  UPDATE "Stock" SET "reservedUnits" = "reservedUnits" + $3;
  INSERT INTO "Reservation" (...);
COMMIT;                          -- Lock released
```

Two concurrent requests hitting the same stock row: one acquires the lock, the other **waits**. When the first commits, the second sees updated data and fails gracefully.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- Upstash Redis account (free tier works)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/Anilllllllll/Allo-Health.git
cd Allo-Health

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in your Supabase and Upstash credentials

# 4. Run the migration SQL in Supabase SQL Editor
# Copy contents of prisma/migration.sql → Supabase Dashboard → SQL Editor → Run

# 5. Generate Prisma client
npx prisma generate

# 6. Seed the database
npm run db:seed

# 7. Start development server
npm run dev
```

### Environment Variables

```env
DATABASE_URL="postgresql://..."      # Supabase pooled connection (port 6543)
DIRECT_URL="postgresql://..."        # Supabase direct connection (for CLI)
UPSTASH_REDIS_REST_URL="https://..." # Upstash Redis REST URL
UPSTASH_REDIS_REST_TOKEN="..."       # Upstash Redis REST token
RESERVATION_TTL_MINUTES=10           # Reservation expiry time
CRON_SECRET="..."                    # Vercel Cron auth secret
```

## 📁 Project Structure

```
allo/
├── app/
│   ├── api/              # Route Handlers (REST API)
│   │   ├── products/     # GET /api/products
│   │   ├── warehouses/   # GET /api/warehouses
│   │   └── reservations/ # POST, confirm, release
│   ├── reservations/     # Reservation management page
│   └── cron/             # Vercel Cron for expiry
├── lib/
│   ├── db.ts             # Prisma client singleton
│   ├── redis.ts          # Upstash Redis client
│   ├── errors.ts         # Custom error classes (409, 410, etc.)
│   └── reservations/     # Business logic layer
├── prisma/
│   ├── schema.prisma     # Database schema
│   ├── seed.ts           # Seed script
│   └── migration.sql     # Initial migration SQL
├── components/           # React components
├── hooks/                # Custom React hooks
├── schemas/              # Zod validation schemas
└── tests/                # Concurrency tests
```

## 🧪 Concurrency Test

```bash
# Sends 50 parallel reservation requests for 1 stock unit
# Expected: exactly 1 success, 49 failures (HTTP 409)
npm run test:concurrency
```

## 📝 API Endpoints

| Method | Endpoint                          | Description          | Error Codes |
| ------ | --------------------------------- | -------------------- | ----------- |
| GET    | `/api/products`                   | List all products    | —           |
| GET    | `/api/warehouses`                 | List all warehouses  | —           |
| POST   | `/api/reservations`               | Reserve stock        | 409         |
| POST   | `/api/reservations/:id/confirm`   | Confirm reservation  | 410         |
| POST   | `/api/reservations/:id/release`   | Release reservation  | —           |

## 📄 License

MIT

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ============================================================
// Prisma Client Singleton (Prisma v7 + Driver Adapter)
// ============================================================
// Prisma v7 requires a driver adapter for database connections.
// We use @prisma/adapter-pg which wraps the `pg` library.
//
// In development, Next.js hot-reloads create new PrismaClient
// instances on every reload. Caching the client on `globalThis`
// prevents exhausting the database connection pool.
// ============================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

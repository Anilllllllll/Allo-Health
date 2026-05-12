import { prisma } from "@/lib/db";
import {
  InsufficientStockError,
  ReservationExpiredError,
  NotFoundError,
  InvalidStateError,
} from "@/lib/errors";
import type { CreateReservationInput } from "@/schemas/reservation";
import type { Reservation } from "@prisma/client";
import { Prisma } from "@prisma/client";

// ============================================================
// Reservation Service — Core Business Logic
// ============================================================
// Every database mutation goes through this service.
// Route handlers are thin wrappers that call these functions.
// ============================================================

const RESERVATION_TTL_MINUTES = parseInt(
  process.env.RESERVATION_TTL_MINUTES || "10",
  10
);

// ----------------------------------------------------------
// Type for raw SQL query result
// ----------------------------------------------------------
interface StockRow {
  id: string;
  productId: string;
  warehouseId: string;
  totalUnits: number;
  reservedUnits: number;
}

// ----------------------------------------------------------
// RESERVE — The critical concurrent-safe operation
// ----------------------------------------------------------
// Flow:
//   1. BEGIN TRANSACTION
//   2. SELECT ... FOR UPDATE  (locks the Stock row)
//   3. Check: available >= requested quantity
//   4. UPDATE Stock.reservedUnits += quantity
//   5. INSERT Reservation (status = PENDING)
//   6. COMMIT (releases lock)
//
// If two users hit this simultaneously for the last item:
//   - User A acquires the lock, checks stock, reserves → COMMIT
//   - User B was WAITING. Now it acquires the lock, checks stock
//     → sees reservedUnits already incremented → available < requested
//     → throws InsufficientStockError → ROLLBACK → HTTP 409
// ----------------------------------------------------------
export async function reserveStock(
  input: CreateReservationInput
): Promise<Reservation> {
  const { productId, warehouseId, quantity } = input;

  return prisma.$transaction(
    async (tx) => {
      // Step 1: Lock the stock row with SELECT FOR UPDATE
      const stockRows = await tx.$queryRaw<StockRow[]>`
        SELECT "id", "productId", "warehouseId", "totalUnits", "reservedUnits"
        FROM "Stock"
        WHERE "productId" = ${productId}
        AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (stockRows.length === 0) {
        throw new NotFoundError(
          `No stock entry found for product ${productId} in warehouse ${warehouseId}`
        );
      }

      const stock = stockRows[0];
      const available = stock.totalUnits - stock.reservedUnits;

      // Step 2: Check availability
      if (available < quantity) {
        throw new InsufficientStockError(
          `Insufficient stock: requested ${quantity}, available ${available}`
        );
      }

      // Step 3: Increment reservedUnits
      await tx.stock.update({
        where: { id: stock.id },
        data: { reservedUnits: { increment: quantity } },
      });

      // Step 4: Create reservation with expiry
      const expiresAt = new Date(
        Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
      );

      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "PENDING",
          expiresAt,
        },
      });

      return reservation;
    },
    {
      // ReadCommitted + FOR UPDATE = correct locking strategy.
      // FOR UPDATE provides row-level locks that queue concurrent
      // transactions. Serializable is too aggressive and causes
      // false-positive aborts under high contention.
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10000, // 10 second timeout
    }
  );
}

// ----------------------------------------------------------
// CONFIRM — Finalize purchase
// ----------------------------------------------------------
// 1. Find the reservation
// 2. Check it's PENDING
// 3. Check it hasn't expired (lazy expiry)
// 4. Mark as CONFIRMED
// ----------------------------------------------------------
export async function confirmReservation(id: string): Promise<Reservation> {
  return prisma.$transaction(async (tx) => {
    // Lock the reservation row
    const reservations = await tx.$queryRaw<
      {
        id: string;
        productId: string;
        warehouseId: string;
        quantity: number;
        status: string;
        expiresAt: Date;
      }[]
    >`
      SELECT "id", "productId", "warehouseId", "quantity", "status", "expiresAt"
      FROM "Reservation"
      WHERE "id" = ${id}
      FOR UPDATE
    `;

    if (reservations.length === 0) {
      throw new NotFoundError(`Reservation ${id} not found`);
    }

    const reservation = reservations[0];

    if (reservation.status !== "PENDING") {
      throw new InvalidStateError(
        `Reservation is ${reservation.status}, cannot confirm`
      );
    }

    // Lazy expiry check
    if (new Date(reservation.expiresAt) < new Date()) {
      // Expire it: release the reserved stock
      await tx.stock.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: { reservedUnits: { decrement: reservation.quantity } },
      });

      await tx.reservation.update({
        where: { id },
        data: { status: "EXPIRED" },
      });

      throw new ReservationExpiredError();
    }

    // Confirm the reservation
    // Note: reservedUnits stays incremented (stock is now "sold")
    const confirmed = await tx.reservation.update({
      where: { id },
      data: { status: "CONFIRMED" },
    });

    return confirmed;
  });
}

// ----------------------------------------------------------
// RELEASE — Cancel / return reservation
// ----------------------------------------------------------
// 1. Find the reservation
// 2. Check it's PENDING
// 3. Decrement reservedUnits
// 4. Mark as RELEASED
// ----------------------------------------------------------
export async function releaseReservation(id: string): Promise<Reservation> {
  return prisma.$transaction(async (tx) => {
    const reservations = await tx.$queryRaw<
      {
        id: string;
        productId: string;
        warehouseId: string;
        quantity: number;
        status: string;
      }[]
    >`
      SELECT "id", "productId", "warehouseId", "quantity", "status"
      FROM "Reservation"
      WHERE "id" = ${id}
      FOR UPDATE
    `;

    if (reservations.length === 0) {
      throw new NotFoundError(`Reservation ${id} not found`);
    }

    const reservation = reservations[0];

    if (reservation.status !== "PENDING") {
      throw new InvalidStateError(
        `Reservation is ${reservation.status}, cannot release`
      );
    }

    // Release the reserved stock
    await tx.stock.update({
      where: {
        productId_warehouseId: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: { reservedUnits: { decrement: reservation.quantity } },
    });

    const released = await tx.reservation.update({
      where: { id },
      data: { status: "RELEASED" },
    });

    return released;
  });
}

// ----------------------------------------------------------
// EXPIRE STALE — Cron job / bulk cleanup
// ----------------------------------------------------------
// Finds all PENDING reservations past their expiresAt,
// releases the stock, and marks them EXPIRED.
// ----------------------------------------------------------
export async function expireStaleReservations(): Promise<number> {
  const now = new Date();

  // Find all expired PENDING reservations
  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
  });

  if (expiredReservations.length === 0) {
    return 0;
  }

  // Process each in a transaction
  for (const reservation of expiredReservations) {
    try {
      await prisma.$transaction(async (tx) => {
        // Lock and re-check (it might have been confirmed in the meantime)
        const current = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT "id", "status"
          FROM "Reservation"
          WHERE "id" = ${reservation.id}
          FOR UPDATE
        `;

        if (current.length === 0 || current[0].status !== "PENDING") {
          return; // Skip — already processed
        }

        await tx.stock.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: { reservedUnits: { decrement: reservation.quantity } },
        });

        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: "EXPIRED" },
        });
      });
    } catch (error) {
      // Log but continue processing other reservations
      console.error(
        `Failed to expire reservation ${reservation.id}:`,
        error
      );
    }
  }

  return expiredReservations.length;
}

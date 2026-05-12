import { NextRequest, NextResponse } from "next/server";
import { createReservationSchema } from "@/schemas/reservation";
import { reserveStock } from "@/lib/reservations/service";
import { AppError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withIdempotency } from "@/lib/idempotency";

// ============================================================
// GET /api/reservations — List recent reservations
// ============================================================
export async function GET() {
  try {
    const reservations = await prisma.reservation.findMany({
      include: {
        product: true,
        warehouse: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(reservations);
  } catch (error) {
    console.error("GET /api/reservations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reservations" },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/reservations — Reserve stock
// ============================================================
// Returns 201 on success, 409 on insufficient stock.
// Uses SELECT ... FOR UPDATE for concurrency safety.
//
// Under extreme concurrency, PostgreSQL's Serializable isolation
// may abort transactions with serialization errors (P2034).
// These are treated as 409 — they mean another transaction
// modified the same stock row, which is the same outcome.
// ============================================================
export async function POST(request: NextRequest) {
  // Wrap with idempotency — if the client sends an Idempotency-Key header,
  // duplicate requests return the cached response without re-executing.
  return withIdempotency(request, async () => {
    try {
      const body = await request.json();

      // Validate request body
      const parsed = createReservationSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      // Execute the reservation (with row-level locking)
      const reservation = await reserveStock(parsed.data);

      return NextResponse.json(reservation, { status: 201 });
    } catch (error) {
    // Application-level errors (InsufficientStockError, etc.)
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    // Prisma serialization / transaction errors → 409
    // P2034: Transaction failed due to serialization failure or deadlock
    // These occur under extreme concurrent contention on the same row
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2028")
    ) {
      return NextResponse.json(
        {
          error: "Stock reservation conflict — please retry",
          code: "SERIALIZATION_CONFLICT",
        },
        { status: 409 }
      );
    }

    // Generic Prisma transaction errors → 409
    if (
      error instanceof Error &&
      (error.message.includes("Transaction") ||
        error.message.includes("serializ") ||
        error.message.includes("deadlock") ||
        error.message.includes("could not serialize"))
    ) {
      return NextResponse.json(
        {
          error: "Stock reservation conflict — please retry",
          code: "TRANSACTION_CONFLICT",
        },
        { status: 409 }
      );
    }

    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
  }); // end withIdempotency
}

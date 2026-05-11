import { NextRequest, NextResponse } from "next/server";
import { createReservationSchema } from "@/schemas/reservation";
import { reserveStock } from "@/lib/reservations/service";
import { AppError } from "@/lib/errors";

// ============================================================
// POST /api/reservations — Reserve stock
// ============================================================
// Returns 201 on success, 409 on insufficient stock.
// Uses SELECT ... FOR UPDATE for concurrency safety.
// ============================================================
export async function POST(request: NextRequest) {
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
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

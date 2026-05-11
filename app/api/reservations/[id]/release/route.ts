import { NextRequest, NextResponse } from "next/server";
import { releaseReservation } from "@/lib/reservations/service";
import { AppError } from "@/lib/errors";

// ============================================================
// POST /api/reservations/:id/release — Release a reservation
// ============================================================
// Returns 200 on success. Decrements reservedUnits in Stock.
// ============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reservation = await releaseReservation(id);

    return NextResponse.json(reservation);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error(`POST /api/reservations/${(await params).id}/release error:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

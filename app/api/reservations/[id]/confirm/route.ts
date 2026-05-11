import { NextRequest, NextResponse } from "next/server";
import { confirmReservation } from "@/lib/reservations/service";
import { AppError } from "@/lib/errors";

// ============================================================
// POST /api/reservations/:id/confirm — Confirm a reservation
// ============================================================
// Returns 200 on success, 410 if expired, 400 if invalid state.
// ============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reservation = await confirmReservation(id);

    return NextResponse.json(reservation);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error(`POST /api/reservations/${(await params).id}/confirm error:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { expireStaleReservations } from "@/lib/reservations/service";

// ============================================================
// POST /api/cron — Expire stale reservations (Vercel Cron)
// ============================================================
// Vercel Cron calls this endpoint periodically.
// Authenticated via CRON_SECRET header.
// ============================================================
export async function POST(request: NextRequest) {
  try {
    // Authenticate cron request
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expiredCount = await expireStaleReservations();

    return NextResponse.json({
      success: true,
      expiredCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/cron error:", error);
    return NextResponse.json(
      { error: "Failed to expire reservations" },
      { status: 500 }
    );
  }
}

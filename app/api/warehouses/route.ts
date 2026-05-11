import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ============================================================
// GET /api/warehouses — List all warehouses
// ============================================================
export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        _count: {
          select: { stocks: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(warehouses);
  } catch (error) {
    console.error("GET /api/warehouses error:", error);
    return NextResponse.json(
      { error: "Failed to fetch warehouses" },
      { status: 500 }
    );
  }
}

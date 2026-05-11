import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ============================================================
// GET /api/products — List all products with stock levels
// ============================================================
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Transform to include availability info
    const enriched = products.map((product) => ({
      ...product,
      stocks: product.stocks.map((stock) => ({
        ...stock,
        available: stock.totalUnits - stock.reservedUnits,
      })),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

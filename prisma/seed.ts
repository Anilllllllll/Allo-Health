import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set in .env");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...\n");

  // ----------------------------------------------------------
  // 1. Add CHECK constraint (idempotent — won't fail if exists)
  // ----------------------------------------------------------
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_reserved_check'
      ) THEN
        ALTER TABLE "Stock"
        ADD CONSTRAINT stock_reserved_check
        CHECK ("reservedUnits" >= 0 AND "reservedUnits" <= "totalUnits");
      END IF;
    END
    $$;
  `);
  console.log("✅ CHECK constraint added (reservedUnits <= totalUnits)\n");

  // ----------------------------------------------------------
  // 2. Create Products
  // ----------------------------------------------------------
  const products = await Promise.all([
    prisma.product.upsert({
      where: { sku: "LAPTOP-001" },
      update: {},
      create: {
        name: 'MacBook Pro 16"',
        description: "Apple M3 Max, 36GB RAM, 1TB SSD",
        sku: "LAPTOP-001",
        price: 2499.99,
        imageUrl: "https://placehold.co/400x300/1a1a2e/e94560?text=MacBook+Pro",
      },
    }),
    prisma.product.upsert({
      where: { sku: "PHONE-001" },
      update: {},
      create: {
        name: "iPhone 16 Pro",
        description: "A18 Pro chip, 256GB, Natural Titanium",
        sku: "PHONE-001",
        price: 1199.99,
        imageUrl: "https://placehold.co/400x300/16213e/0f3460?text=iPhone+16",
      },
    }),
    prisma.product.upsert({
      where: { sku: "HEADPHONES-001" },
      update: {},
      create: {
        name: "Sony WH-1000XM5",
        description: "Wireless Noise-Cancelling Headphones",
        sku: "HEADPHONES-001",
        price: 349.99,
        imageUrl: "https://placehold.co/400x300/1a1a2e/533483?text=Sony+XM5",
      },
    }),
    prisma.product.upsert({
      where: { sku: "TABLET-001" },
      update: {},
      create: {
        name: "iPad Air M2",
        description: "11-inch, 256GB, Wi-Fi, Starlight",
        sku: "TABLET-001",
        price: 799.99,
        imageUrl: "https://placehold.co/400x300/0f3460/e94560?text=iPad+Air",
      },
    }),
    prisma.product.upsert({
      where: { sku: "WATCH-001" },
      update: {},
      create: {
        name: "Apple Watch Ultra 2",
        description: "49mm Titanium Case, Alpine Loop",
        sku: "WATCH-001",
        price: 799.99,
        imageUrl: "https://placehold.co/400x300/533483/e94560?text=Watch+Ultra",
      },
    }),
  ]);
  console.log(`✅ Created ${products.length} products`);

  // ----------------------------------------------------------
  // 3. Create Warehouses
  // ----------------------------------------------------------
  const warehouses = await Promise.all([
    prisma.warehouse.upsert({
      where: { id: "wh-mumbai" },
      update: {},
      create: {
        id: "wh-mumbai",
        name: "Mumbai Central Hub",
        location: "Mumbai, Maharashtra",
      },
    }),
    prisma.warehouse.upsert({
      where: { id: "wh-delhi" },
      update: {},
      create: {
        id: "wh-delhi",
        name: "Delhi NCR Warehouse",
        location: "Gurgaon, Haryana",
      },
    }),
    prisma.warehouse.upsert({
      where: { id: "wh-bangalore" },
      update: {},
      create: {
        id: "wh-bangalore",
        name: "Bangalore Tech Park",
        location: "Whitefield, Bangalore",
      },
    }),
  ]);
  console.log(`✅ Created ${warehouses.length} warehouses`);

  // ----------------------------------------------------------
  // 4. Create Stock Entries
  // ----------------------------------------------------------
  const stockEntries = [];

  for (const product of products) {
    for (const warehouse of warehouses) {
      let totalUnits: number;

      if (product.sku === "WATCH-001" && warehouse.id === "wh-mumbai") {
        totalUnits = 1;
      } else if (product.sku === "WATCH-001") {
        totalUnits = 0;
      } else {
        totalUnits = Math.floor(Math.random() * 46) + 5;
      }

      stockEntries.push(
        prisma.stock.upsert({
          where: {
            productId_warehouseId: {
              productId: product.id,
              warehouseId: warehouse.id,
            },
          },
          update: { totalUnits, reservedUnits: 0 },
          create: {
            productId: product.id,
            warehouseId: warehouse.id,
            totalUnits,
            reservedUnits: 0,
          },
        })
      );
    }
  }

  await Promise.all(stockEntries);
  console.log(`✅ Created ${stockEntries.length} stock entries`);

  console.log("\n🎉 Seeding complete!");
  console.log("   → Apple Watch Ultra has 1 unit in Mumbai (concurrency test target)");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

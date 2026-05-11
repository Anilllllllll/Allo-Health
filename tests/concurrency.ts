// ============================================================
// Concurrency Test — 50 parallel reservations for 1 stock unit
// ============================================================
// This test proves that our SELECT ... FOR UPDATE row-level
// locking prevents overselling under concurrent access.
//
// Expected results:
//   - Exactly 1 request succeeds (HTTP 201)
//   - Exactly 49 requests fail (HTTP 409)
//   - reservedUnits in Stock table = 1
//   - No overselling
//
// Run: npm run test:concurrency
// Requires: dev server running on localhost:3000
// ============================================================

import "dotenv/config";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const CONCURRENT_REQUESTS = 50;

interface TestResult {
  index: number;
  status: number;
  body: Record<string, unknown>;
  duration: number;
}

async function findConcurrencyTestTarget(): Promise<{
  productId: string;
  warehouseId: string;
  productName: string;
}> {
  const res = await fetch(`${BASE_URL}/api/products`);
  const products = (await res.json()) as Array<{
    id: string;
    name: string;
    sku: string;
    stocks: Array<{
      warehouseId: string;
      totalUnits: number;
      reservedUnits: number;
      available: number;
      warehouse: { name: string };
    }>;
  }>;

  // Find Apple Watch Ultra in Mumbai (1 unit)
  const watch = products.find((p) => p.sku === "WATCH-001");
  if (!watch) {
    throw new Error("Apple Watch Ultra (WATCH-001) not found. Run db:seed first.");
  }

  const mumbaiStock = watch.stocks.find(
    (s) => s.warehouseId === "wh-mumbai"
  );
  if (!mumbaiStock) {
    throw new Error("Mumbai warehouse stock not found for WATCH-001.");
  }

  if (mumbaiStock.available < 1) {
    throw new Error(
      `No available stock for WATCH-001 in Mumbai (available: ${mumbaiStock.available}). ` +
      `Reset by running: npm run db:seed`
    );
  }

  console.log(`\n🎯 Target: "${watch.name}" in ${mumbaiStock.warehouse.name}`);
  console.log(`   Available: ${mumbaiStock.available} unit(s)`);
  console.log(`   Total: ${mumbaiStock.totalUnits}, Reserved: ${mumbaiStock.reservedUnits}\n`);

  return {
    productId: watch.id,
    warehouseId: "wh-mumbai",
    productName: watch.name,
  };
}

async function sendReservationRequest(
  productId: string,
  warehouseId: string,
  index: number
): Promise<TestResult> {
  const start = performance.now();

  try {
    const res = await fetch(`${BASE_URL}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        warehouseId,
        quantity: 1,
      }),
    });

    const body = await res.json();
    const duration = Math.round(performance.now() - start);

    return { index, status: res.status, body, duration };
  } catch (error) {
    const duration = Math.round(performance.now() - start);
    return {
      index,
      status: 0,
      body: { error: (error as Error).message },
      duration,
    };
  }
}

async function runConcurrencyTest() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  CONCURRENCY TEST — Inventory Reservation System");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Requests: ${CONCURRENT_REQUESTS} parallel`);
  console.log(`  Target:   1 stock unit`);
  console.log(`  Expected: 1 success (201), ${CONCURRENT_REQUESTS - 1} conflicts (409)`);
  console.log("═══════════════════════════════════════════════════════");

  // 1. Find the test target
  const { productId, warehouseId } = await findConcurrencyTestTarget();

  // 2. Fire all requests simultaneously
  console.log(`🚀 Firing ${CONCURRENT_REQUESTS} parallel requests...\n`);
  const startTime = performance.now();

  const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
    sendReservationRequest(productId, warehouseId, i)
  );

  const results = await Promise.all(promises);
  const totalDuration = Math.round(performance.now() - startTime);

  // 3. Analyze results
  const successes = results.filter((r) => r.status === 201);
  const conflicts = results.filter((r) => r.status === 409);
  const errors = results.filter((r) => r.status !== 201 && r.status !== 409);

  console.log("───────────────────────────────────────────────────────");
  console.log("  RESULTS");
  console.log("───────────────────────────────────────────────────────");
  console.log(`  ✅ Successes (201):  ${successes.length}`);
  console.log(`  ❌ Conflicts (409):  ${conflicts.length}`);
  if (errors.length > 0) {
    console.log(`  ⚠️  Other errors:    ${errors.length}`);
    errors.forEach((e) =>
      console.log(`     → Request #${e.index}: HTTP ${e.status} — ${JSON.stringify(e.body)}`)
    );
  }
  console.log(`  ⏱  Total time:      ${totalDuration}ms`);
  console.log(`  ⏱  Avg per request:  ${Math.round(totalDuration / CONCURRENT_REQUESTS)}ms`);
  console.log("───────────────────────────────────────────────────────");

  // 4. Verify stock state
  const verifyRes = await fetch(`${BASE_URL}/api/products`);
  const verifyProducts = (await verifyRes.json()) as Array<{
    sku: string;
    stocks: Array<{
      warehouseId: string;
      totalUnits: number;
      reservedUnits: number;
      available: number;
    }>;
  }>;

  const verifyWatch = verifyProducts.find((p) => p.sku === "WATCH-001");
  const verifyStock = verifyWatch?.stocks.find(
    (s) => s.warehouseId === "wh-mumbai"
  );

  console.log("\n  POST-TEST STOCK STATE:");
  console.log(`  Total:    ${verifyStock?.totalUnits}`);
  console.log(`  Reserved: ${verifyStock?.reservedUnits}`);
  console.log(`  Available: ${verifyStock?.available}`);

  // 5. Final verdict
  console.log("\n═══════════════════════════════════════════════════════");

  const passed =
    successes.length === 1 &&
    conflicts.length === CONCURRENT_REQUESTS - 1 &&
    errors.length === 0 &&
    verifyStock?.reservedUnits === 1;

  if (passed) {
    console.log("  ✅ TEST PASSED — No overselling detected!");
    console.log("     Exactly 1 reservation succeeded.");
    console.log("     Row-level locking (SELECT FOR UPDATE) works correctly.");
  } else {
    console.log("  ❌ TEST FAILED");
    if (successes.length !== 1) {
      console.log(`     Expected 1 success, got ${successes.length}`);
    }
    if (conflicts.length !== CONCURRENT_REQUESTS - 1) {
      console.log(`     Expected ${CONCURRENT_REQUESTS - 1} conflicts, got ${conflicts.length}`);
    }
    if (verifyStock?.reservedUnits !== 1) {
      console.log(`     Expected reservedUnits=1, got ${verifyStock?.reservedUnits}`);
    }
  }

  console.log("═══════════════════════════════════════════════════════\n");

  // Print the successful reservation details
  if (successes.length > 0) {
    console.log("  Winning reservation:");
    console.log(`  → Request #${successes[0].index}`);
    console.log(`  → ID: ${(successes[0].body as { id?: string }).id}`);
    console.log(`  → Completed in ${successes[0].duration}ms`);
  }

  process.exit(passed ? 0 : 1);
}

runConcurrencyTest().catch((err) => {
  console.error("Test setup failed:", err);
  process.exit(1);
});

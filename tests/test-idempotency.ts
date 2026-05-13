// ============================================================
// IDEMPOTENCY TEST — Verify Redis-backed deduplication
// ============================================================
// Run: npx tsx tests/test-idempotency.ts
// Requires: dev server running on localhost:3000, fresh db:seed
// ============================================================

import "dotenv/config";

const BASE = "http://localhost:3000";

async function main() {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║  IDEMPOTENCY TEST — Redis Deduplication           ║");
  console.log("╚═══════════════════════════════════════════════════╝\n");

  // Step 1: Get a product to reserve
  const productsRes = await fetch(`${BASE}/api/products`);
  const products = await productsRes.json();
  const watch = products.find((p: any) => p.sku === "WATCH-001");
  const stock = watch.stocks.find((s: any) => s.warehouseId === "wh-mumbai");

  console.log(`  Product: ${watch.name}`);
  console.log(`  Stock:   ${stock.available} available in Mumbai\n`);

  // Step 2: Send FIRST request with Idempotency-Key
  const idempotencyKey = `test-key-${Date.now()}`;
  console.log(`  Idempotency-Key: ${idempotencyKey}\n`);

  console.log("  ─── Request 1 (first time) ───");
  const res1 = await fetch(`${BASE}/api/reservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      productId: watch.id,
      warehouseId: "wh-mumbai",
      quantity: 1,
    }),
  });
  const body1 = await res1.json();
  const status1 = res1.headers.get("X-Idempotency-Status");

  console.log(`  Status:     ${res1.status}`);
  console.log(`  Idempotency: ${status1}`);
  console.log(`  Reservation: ${body1.id}`);
  console.log(`  Result:     ${res1.status === 201 && status1 === "executed" ? "✅ PASS — Fresh execution" : "❌ FAIL"}\n`);

  // Step 3: Send SAME request with SAME Idempotency-Key (retry)
  console.log("  ─── Request 2 (retry with same key) ───");
  const res2 = await fetch(`${BASE}/api/reservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      productId: watch.id,
      warehouseId: "wh-mumbai",
      quantity: 1,
    }),
  });
  const body2 = await res2.json();
  const status2 = res2.headers.get("X-Idempotency-Status");

  console.log(`  Status:     ${res2.status}`);
  console.log(`  Idempotency: ${status2}`);
  console.log(`  Reservation: ${body2.id}`);
  console.log(`  Result:     ${res2.status === 201 && status2 === "cached" ? "✅ PASS — Cached response (no duplicate)" : "❌ FAIL"}\n`);

  // Step 4: Verify SAME reservation ID returned (no duplicate created)
  console.log("  ─── Verification ───");
  const sameId = body1.id === body2.id;
  console.log(`  Request 1 ID: ${body1.id}`);
  console.log(`  Request 2 ID: ${body2.id}`);
  console.log(`  Same ID:      ${sameId ? "✅ YES — No duplicate reservation" : "❌ NO — Duplicate created!"}\n`);

  // Step 5: Send request WITHOUT Idempotency-Key (should work normally)
  // First release the reservation so stock is available
  await fetch(`${BASE}/api/reservations/${body1.id}/release`, { method: "POST" });

  console.log("  ─── Request 3 (no Idempotency-Key header) ───");
  const res3 = await fetch(`${BASE}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: watch.id,
      warehouseId: "wh-mumbai",
      quantity: 1,
    }),
  });
  const body3 = await res3.json();
  const status3 = res3.headers.get("X-Idempotency-Status");

  console.log(`  Status:      ${res3.status}`);
  console.log(`  Idempotency: ${status3 || "(no header — skipped)"}`);
  console.log(`  Result:      ${res3.status === 201 && !status3 ? "✅ PASS — Works without header" : "❌ FAIL"}\n`);

  // Clean up
  if (body3.id) {
    await fetch(`${BASE}/api/reservations/${body3.id}/release`, { method: "POST" });
  }

  // Summary
  const allPassed = 
    res1.status === 201 && status1 === "executed" &&
    res2.status === 201 && status2 === "cached" &&
    sameId &&
    res3.status === 201 && !status3;

  console.log("╔═══════════════════════════════════════════════════╗");
  console.log(`║  RESULT: ${allPassed ? "ALL PASSED ✅" : "SOME FAILED ❌"}                              ║`);
  console.log("╚═══════════════════════════════════════════════════╝\n");

  if (allPassed) {
    console.log("  Redis idempotency is WORKING:");
    console.log("  • 1st request → executed & cached in Redis");
    console.log("  • 2nd request → returned cached response (no side effect)");
    console.log("  • Same reservation ID both times (no duplicate)");
    console.log("  • Without header → executes normally (opt-in)\n");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

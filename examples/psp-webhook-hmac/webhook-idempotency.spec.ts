import { test, expect, request as pwRequest } from "@playwright/test";
import { pspCallbackSignature, toProviderReference } from "./hmac";

// PATTERN: test a payment provider callback end to end, including idempotency,
// without any real payment. Assumes helpers (createPendingOrder, readOrder,
// readStock) that talk to your LOCAL Supabase stack with the service role.
// Shown here as an outline; wire the helpers to your own fixtures.
//
// The four cases that actually matter for money:
//   1. success  -> order paid, stock decremented exactly once, confirmation queued
//   2. duplicate -> provider retries; second identical callback is a NO-OP
//   3. tampered  -> bad signature rejected with zero side effects
//   4. underpaid -> flagged for manual review, not silently fulfilled

const TEST_KEY = process.env.PSP_MERCHANT_KEY ?? "test-key";
const TEST_SALT = process.env.PSP_MERCHANT_SALT ?? "test-salt";
const BASE_URL = "http://localhost:3000";

function callbackForm(order: { orderNo: string; amountMinor: number }, status: "success" | "failed") {
  const reference = toProviderReference(order.orderNo);
  const amount = String(order.amountMinor);
  return {
    reference,
    status,
    amount,
    signature: pspCallbackSignature({
      reference,
      status,
      amount,
      merchantKey: TEST_KEY,
      merchantSalt: TEST_SALT,
    }),
  };
}

test.describe("PSP callback: idempotency and side effects", () => {
  test.describe.configure({ mode: "serial" });

  test("success decrements stock exactly once, even on a duplicate retry", async () => {
    // The provider is NEVER contacted. We sign and post the callback ourselves.
    const anon = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      // const order = await createPendingOrder({ sku: "SKU-1", method: "card" });
      // const stockBefore = await readStock("SKU-1");
      const order = { orderNo: "ORD-2026-000123", orderId: "<uuid>", amountMinor: 12990 };

      const form = callbackForm(order, "success");

      const first = await anon.post("/api/psp/callback", { form });
      expect(first.status()).toBe(200);
      // expect(await readOrder(order.orderNo)).toMatchObject({ status: "paid" });
      // expect(await readStock("SKU-1")).toBe(stockBefore - 1);

      // Providers retry. The exact same callback must be a no-op the second time.
      const second = await anon.post("/api/psp/callback", { form });
      expect(second.status()).toBe(200);
      // expect(await readStock("SKU-1")).toBe(stockBefore - 1); // NOT minus 2
    } finally {
      await anon.dispose();
    }
  });

  test("a tampered signature is rejected with no state change", async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      const res = await anon.post("/api/psp/callback", {
        form: {
          reference: "ORD2026000123",
          status: "success",
          amount: "12990",
          signature: "not-a-valid-signature",
        },
      });
      expect(res.status()).toBe(400);
      // expect(await readOrder("ORD-2026-000123")).toMatchObject({ status: "pending_payment" });
    } finally {
      await anon.dispose();
    }
  });
});

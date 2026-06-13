import { test, expect, request as pwRequest } from "@playwright/test";

// PATTERN: verify a websocket / realtime feature with two independent contexts.
//   - A browser context (the admin) subscribes and waits for a live event.
//   - A separate API context (a customer) triggers the event (places an order).
//   - The admin context asserts the notification appears WITHOUT a refresh.
//
// The trap that wastes hours: the client must load the session and call
// realtime.setAuth(token) BEFORE subscribing. If you subscribe first, the channel
// joins with an anonymous token, row-level security delivers nothing, and the
// channel still reports SUBSCRIBED. A silent dead end. So the component should
// expose its subscription status (e.g. a data-testid with data-status), and the
// test waits for SUBSCRIBED before triggering the event.

const ADMIN_STATE = "e2e/.auth/admin.json";
const CUSTOMER_STATE = "e2e/.auth/customer.json";
const BASE_URL = "http://localhost:3000";

test.use({ storageState: ADMIN_STATE });

test("an order insert reaches the admin live, with no refresh", async ({ page }) => {
  // Bonus: collect websocket frames for a soft, transport-level assertion.
  const frames: string[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", (e) => frames.push(typeof e.payload === "string" ? e.payload : ""));
  });

  await page.goto("/admin");
  // Wait until the subscription is actually live (see the trap note above).
  await expect(page.getByTestId("orders-realtime")).toHaveAttribute("data-status", "SUBSCRIBED", {
    timeout: 20_000,
  });

  // Separate context triggers the event. Replace with your own order helper.
  const customer = await pwRequest.newContext({ baseURL: BASE_URL, storageState: CUSTOMER_STATE });
  let orderNo = "";
  try {
    const res = await customer.post("/api/checkout", { data: { /* minimal valid order */ } });
    orderNo = (await res.json()).orderNo;
  } finally {
    await customer.dispose();
  }

  // Primary assertion: the UI notification, matched to OUR order number so parallel
  // specs placing orders cannot make this pass for the wrong reason.
  await expect(page.getByText(`New order: ${orderNo}`)).toBeVisible({ timeout: 15_000 });

  // Soft, bonus assertion: the realtime frame carried our event. Kept soft so
  // transport noise can never flake the run.
  const joined = frames.join("\n");
  expect.soft(joined).toContain("postgres_changes");
  expect.soft(joined).toContain(orderNo);
});

import { createHmac } from "node:crypto";

// PATTERN: compute the payment provider's callback signature yourself, in the test.
//
// A payment service provider (PSP) confirms a charge by calling your server back with
// an HMAC-signed message. To test that callback handler without any real payment, you
// generate the exact same signature with the TEST credentials and post the callback
// yourself. No real charge, no external network call, full control over the scenario.
//
// The signature formula here mirrors a common PSP scheme: the signed string is the
// concatenation of the order reference, a server-side salt, the status and the amount;
// the signature is the base64 of HMAC-SHA256 over that string with the merchant key.
// Adapt the field order to your provider's documented scheme.

export function pspCallbackSignature(params: {
  reference: string;
  status: string;
  amount: string;
  merchantKey: string;
  merchantSalt: string;
}): string {
  const { reference, status, amount, merchantKey, merchantSalt } = params;
  return createHmac("sha256", merchantKey)
    .update(reference + merchantSalt + status + amount)
    .digest("base64");
}

// Many PSPs forbid non-alphanumeric characters in the order reference they echo back.
// If your order numbers contain dashes (ORD-2026-000123), strip them for the provider
// and restore on the way back. Keep both forms when matching the callback to an order.
export function toProviderReference(orderNo: string): string {
  return orderNo.replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
}

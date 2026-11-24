import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPaystackSignature, verifyStripeSignature } from "./signatures.js";

describe("payment signatures", () => {
  it("accepts a current Stripe signature and rejects a stale or altered body", () => {
    const payload = JSON.stringify({ id: "evt_1" });
    const secret = "whsec_test";
    const timestamp = 1_700_000_000;
    const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const header = `t=${timestamp},v1=${digest}`;
    expect(verifyStripeSignature(payload, header, secret, timestamp * 1000)).toBe(true);
    expect(verifyStripeSignature(`${payload} `, header, secret, timestamp * 1000)).toBe(false);
    expect(verifyStripeSignature(payload, header, secret, timestamp * 1000 + 10 * 60 * 1000)).toBe(false);
  });

  it("accepts a Paystack HMAC of the raw body", () => {
    const payload = JSON.stringify({ event: "charge.success" });
    const secret = "paystack_test";
    const header = createHmac("sha512", secret).update(payload).digest("hex");
    expect(verifyPaystackSignature(payload, header, secret)).toBe(true);
    expect(verifyPaystackSignature(payload, header, "other")).toBe(false);
  });
});

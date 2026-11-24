import { describe, expect, it } from "vitest";
import { applyWebhookOnce, browserCheckoutResult, checkoutAllowed, drawLots, expireLots, formatMoney, lowCreditCrossed, settleHold, subscriptionStateFromProvider } from "./billing.js";
import { computeAnalytics } from "./analytics.js";
import { classifyJobFailure, duplicateJob, nextJobDecision } from "./jobs.js";

describe("billing ledger rules", () => {
  it("draws the soonest-expiring credits and settles a hold", () => {
    const drawn = drawLots(
      [
        { id: "later", remaining: 5, expiresAt: "2026-12-01T00:00:00.000Z" },
        { id: "soon", remaining: 2, expiresAt: "2026-02-01T00:00:00.000Z" },
      ],
      3,
      "2026-01-01T00:00:00.000Z",
    );
    expect(drawn.find((lot) => lot.id === "soon")?.remaining).toBe(0);
    expect(drawn.find((lot) => lot.id === "later")?.remaining).toBe(4);
    expect(settleHold(5, 2)).toEqual({ charged: 2, refund: 3 });
    expect(lowCreditCrossed(25, 10, 20)).toBe(true);
    expect(formatMoney(4900, "NGN")).toContain("49");
    expect(checkoutAllowed("enterprise")).toMatch(/sales/);
    expect(subscriptionStateFromProvider("canceled")).toBe("cancelled");
    expect(subscriptionStateFromProvider("unpaid")).toBe("past_due");
    expect(applyWebhookOnce(new Set(["evt_1"]), "evt_1")).toBe("duplicate");
    expect(browserCheckoutResult(new URLSearchParams("checkout=return"))).toBe("pending_provider_confirmation");
  });

  it("expires only lots whose time has passed", () => {
    const result = expireLots(
      [
        { id: "open", remaining: 4, expiresAt: null },
        { id: "old", remaining: 3, expiresAt: "2026-01-01T00:00:00.000Z" },
      ],
      "2026-02-01T00:00:00.000Z",
    );
    expect(result.expired).toBe(3);
    expect(result.lots.find((lot) => lot.id === "open")?.remaining).toBe(4);
  });
});

describe("analytics and jobs", () => {
  it("uses real denominators and does not invent revenue or positive replies", () => {
    const summary = computeAnalytics({
      prospects: [
        { createdAt: "2026-01-02", stage: "CUSTOMER", industry: "Software", location: "Lagos", source: "apollo", ownerId: "u1", icpId: "icp" },
        { createdAt: "2026-01-03", stage: "NEW", industry: "Software", location: null, source: null, ownerId: null, icpId: null },
      ],
      meetings: [{ createdAt: "2026-01-04", providerConfirmed: true }, { createdAt: "2026-01-04", providerConfirmed: false }],
      messages: [
        { createdAt: "2026-01-04", direction: "outbound", deliveryState: "accepted" },
        { createdAt: "2026-01-05", direction: "outbound", deliveryState: "delivered" },
        { createdAt: "2026-01-05", direction: "inbound", deliveryState: "delivered" },
      ],
      enrollments: [{ createdAt: "2026-01-01", stopReason: "unsubscribe" }],
      jobs: [{ createdAt: "2026-01-06", status: "dead_letter" }],
      suppressions: [],
      invoices: [{ createdAt: "2026-01-07", status: "paid", amountCents: 4900, currency: "USD" }, { createdAt: "2026-01-07", status: "open", amountCents: 100, currency: "USD" }],
      credits: [{ createdAt: "2026-01-02", amount: -5, reason: "analysis" }],
      subscriptions: [{ planCode: "starter", status: "active" }],
    });
    expect(summary.prospects.discovered).toBe(2);
    expect(summary.prospects.meetingsBooked).toBe(1);
    expect(summary.rates.prospectConversion).toBe(0.5);
    expect(summary.campaigns.positiveReplies).toBeNull();
    expect(summary.campaigns.delivered).toBe(1);
    expect(summary.finance.revenueByCurrency).toEqual([{ currency: "USD", amountCents: 4900 }]);
    expect(computeAnalytics({ prospects: [], meetings: [], messages: [], enrollments: [], jobs: [], suppressions: [], invoices: [], credits: [], subscriptions: [] }).rates.prospectConversion).toBeNull();
  });

  it("bounds retries and rejects duplicate jobs", () => {
    expect(nextJobDecision({ attempts: 1, maxAttempts: 3, category: "temporary" }).retry).toBe(true);
    expect(nextJobDecision({ attempts: 1, maxAttempts: 3, category: "validation" }).status).toBe("dead_letter");
    expect(classifyJobFailure({ message: "OpenAI is not configured" })).toBe("configuration");
    expect(duplicateJob(new Set(["job-1"]), "job-1")).toBe(true);
  });
});

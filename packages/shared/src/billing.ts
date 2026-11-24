export const PLAN_CODES = ["free", "starter", "growth", "business", "enterprise"] as const;

export type PlanCode = (typeof PLAN_CODES)[number];

export const CREDIT_ACTIVITIES = [
  "company_discovery",
  "contact_discovery",
  "contact_enrichment",
  "company_enrichment",
  "website_analysis",
  "ai_research",
  "email_generation",
  "bulk_operation",
] as const;

export type CreditLot = {
  id: string;
  remaining: number;
  expiresAt: string | null;
};

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

export function settleHold(reserved: number, actual: number): { charged: number; refund: number } {
  if (!Number.isInteger(reserved) || !Number.isInteger(actual) || reserved < 0 || actual < 0) {
    throw new Error("Credit amounts must be non-negative integers.");
  }
  if (actual > reserved) {
    throw new Error("Settled usage cannot exceed the reservation.");
  }
  return { charged: actual, refund: reserved - actual };
}

export function lowCreditCrossed(before: number, after: number, threshold: number): boolean {
  return before >= threshold && after < threshold;
}

export function drawLots(lots: CreditLot[], amount: number, nowIso: string): CreditLot[] {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("Credit amounts must be non-negative integers.");
  }
  const now = Date.parse(nowIso);
  const next = lots.map((lot) => ({ ...lot }));
  const usable = next
    .filter((lot) => lot.remaining > 0 && (lot.expiresAt === null || Date.parse(lot.expiresAt) > now))
    .sort((left, right) => {
      if (left.expiresAt === right.expiresAt) return left.id.localeCompare(right.id);
      if (left.expiresAt === null) return 1;
      if (right.expiresAt === null) return -1;
      return left.expiresAt.localeCompare(right.expiresAt);
    });
  const available = usable.reduce((sum, lot) => sum + lot.remaining, 0);
  if (available < amount) {
    throw new Error("insufficient credits");
  }
  let left = amount;
  for (const lot of usable) {
    if (left === 0) break;
    const taken = Math.min(lot.remaining, left);
    lot.remaining -= taken;
    left -= taken;
  }
  return next;
}

export function expireLots(lots: CreditLot[], nowIso: string): { lots: CreditLot[]; expired: number } {
  const now = Date.parse(nowIso);
  let expired = 0;
  const next = lots.map((lot) => {
    if (lot.remaining > 0 && lot.expiresAt !== null && Date.parse(lot.expiresAt) <= now) {
      expired += lot.remaining;
      return { ...lot, remaining: 0 };
    }
    return { ...lot };
  });
  return { lots: next, expired };
}

export function checkoutAllowed(planCode: string): string | null {
  if (planCode === "free") return "The Free plan does not use checkout.";
  if (planCode === "enterprise") return "Enterprise billing is arranged with sales, not self-serve checkout.";
  if (!PLAN_CODES.includes(planCode as PlanCode)) return "Unknown plan.";
  return null;
}

const PROVIDER_SUBSCRIPTION_STATES = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "cancelled",
  cancelled: "cancelled",
  incomplete: "incomplete",
  incomplete_expired: "incomplete",
} as const;

export type SubscriptionState = (typeof PROVIDER_SUBSCRIPTION_STATES)[keyof typeof PROVIDER_SUBSCRIPTION_STATES];

export function subscriptionStateFromProvider(status: string): SubscriptionState | null {
  return PROVIDER_SUBSCRIPTION_STATES[status as keyof typeof PROVIDER_SUBSCRIPTION_STATES] ?? null;
}

export function applyWebhookOnce(storedEventIds: ReadonlySet<string>, eventId: string): "apply" | "duplicate" {
  return storedEventIds.has(eventId) ? "duplicate" : "apply";
}

export function browserCheckoutResult(params: URLSearchParams): "pending_provider_confirmation" | "cancelled" | null {
  const value = params.get("checkout");
  if (value === "return") return "pending_provider_confirmation";
  if (value === "cancel") return "cancelled";
  return null;
}

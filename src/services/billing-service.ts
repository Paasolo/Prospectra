import { z } from "zod";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { postWorker } from "@/services/worker-client";

const checkoutSchema = z.object({
  status: z.enum(["redirect", "pending_provider_confirmation"]),
  url: z.string().url().optional(),
  message: z.string(),
});

const cancelSchema = z.object({
  status: z.literal("pending_provider_confirmation"),
  message: z.string(),
  cancelAt: z.string().nullable(),
});

export const billingService = {
  async load(workspaceId: string) {
    const client = getSupabaseClient();
    const [plans, subscription, account, ledger, reservations, invoices, refunds, profile] = await Promise.all([
      client.from("plans").select("*").eq("is_active", true).order("monthly_price_cents"),
      client.from("subscriptions").select("*").eq("workspace_id", workspaceId).maybeSingle(),
      client.from("credit_accounts").select("*").eq("workspace_id", workspaceId).maybeSingle(),
      client.from("credit_transactions").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
      client.from("credit_reservations").select("*").eq("workspace_id", workspaceId).eq("status", "held").order("created_at", { ascending: false }).limit(20),
      client.from("invoices").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
      client.from("refunds").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
      client.from("billing_profiles").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    ]);
    const error = [plans, subscription, account, ledger, reservations, invoices, refunds, profile].find((result) => result.error)?.error;
    if (error) throw new Error(error.message);
    return {
      plans: plans.data ?? [],
      subscription: subscription.data,
      account: account.data,
      ledger: ledger.data ?? [],
      reservations: reservations.data ?? [],
      invoices: invoices.data ?? [],
      refunds: refunds.data ?? [],
      profile: profile.data,
    };
  },
  checkout(body: { workspaceId: string; planCode: string; interval: "month" | "year"; provider: "stripe" | "paystack" }) {
    return postWorker("/v1/billing/checkout", body, checkoutSchema);
  },
  change(body: { workspaceId: string; planCode: string; interval: "month" | "year"; provider: "stripe" | "paystack" }) {
    return postWorker("/v1/billing/change", body, checkoutSchema);
  },
  cancel(workspaceId: string) {
    return postWorker("/v1/billing/cancel", { workspaceId }, cancelSchema);
  },
  async saveProfile(workspaceId: string, values: { legal_name: string; billing_email: string; tax_id: string }) {
    const client = getSupabaseClient();
    const { error } = await client.from("billing_profiles").upsert({ workspace_id: workspaceId, ...values });
    if (error) throw new Error(error.message);
  },
};

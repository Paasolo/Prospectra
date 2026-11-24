import { checkoutAllowed, subscriptionStateFromProvider, type SubscriptionState } from "@prospectra/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { WorkerConfig } from "../config.js";
import { HttpError } from "../http/errors.js";
import { verifyPaystackSignature, verifyStripeSignature } from "./signatures.js";

type FetchImpl = typeof fetch;

const stripeSubscriptionSchema = z.object({
  id: z.string(),
  status: z.string(),
  customer: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
  current_period_start: z.number().optional(),
  current_period_end: z.number().optional(),
  cancel_at: z.number().nullable().optional(),
  cancel_at_period_end: z.boolean().optional(),
  currency: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

const stripeInvoiceSchema = z.object({
  id: z.string(),
  status: z.string().nullable(),
  amount_paid: z.number().optional(),
  amount_due: z.number().optional(),
  currency: z.string(),
  hosted_invoice_url: z.string().nullable().optional(),
  subscription: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
});

const stripeChargeSchema = z.object({
  id: z.string(),
  amount_refunded: z.number().default(0),
  currency: z.string(),
  invoice: z.string().nullable().optional(),
  metadata: z.record(z.string()).optional(),
});

async function stripeRequest(secret: string, method: string, path: string, body: URLSearchParams | undefined, fetchImpl: FetchImpl): Promise<unknown> {
  const response = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${secret}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body,
  });
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new HttpError(502, "PROVIDER_ERROR", payload?.error?.message ?? "Stripe did not accept the request.");
  }
  return payload;
}

function unix(value: number | undefined): string | null {
  return value ? new Date(value * 1000).toISOString() : null;
}

function customerId(value: z.infer<typeof stripeSubscriptionSchema>["customer"]): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function notify(admin: SupabaseClient, config: WorkerConfig, workspaceId: string, type: string, title: string, body: string): Promise<void> {
  const { data: members } = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).in("role", ["OWNER", "ADMIN"]);
  if (!members?.length) return;
  await admin.from("notifications").insert(members.map((member) => ({ workspace_id: workspaceId, user_id: member.user_id, type, title, body })));
  if (!config.resendApiKey) return;
  const { data: preferences } = await admin.from("notification_preferences").select("user_id").eq("workspace_id", workspaceId).eq("type", type).eq("email", true);
  const wanted = new Set((preferences ?? []).map((row) => row.user_id));
  if (!wanted.size) return;
  const { data: profiles } = await admin.from("profiles").select("id, email").in("id", [...wanted]);
  for (const profile of profiles ?? []) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.resendApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: "Prospectra <notifications@prospectra.app>", to: [profile.email], subject: title, text: body }),
    }).catch(() => undefined);
  }
}

async function planByCode(admin: SupabaseClient, code: string) {
  const { data, error } = await admin.from("plans").select("id, code, name, currency, monthly_price_cents, annual_price_cents, included_credits").eq("code", code).eq("is_active", true).maybeSingle();
  if (error) throw new HttpError(500, "INTERNAL", error.message);
  if (!data) throw new HttpError(404, "NOT_FOUND", "Plan not found.");
  return data;
}

export async function createCheckoutSession(input: {
  admin: SupabaseClient;
  config: WorkerConfig;
  workspaceId: string;
  planCode: string;
  interval: "month" | "year";
  provider: "stripe" | "paystack";
  email: string;
  fetchImpl?: FetchImpl;
}): Promise<{ url: string }> {
  const blocked = checkoutAllowed(input.planCode);
  if (blocked) throw new HttpError(400, "VALIDATION_FAILED", blocked);
  if (!input.config.appUrl) throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Set APP_URL before starting checkout.");
  const plan = await planByCode(input.admin, input.planCode);
  const amount = input.interval === "year" ? plan.annual_price_cents : plan.monthly_price_cents;
  if (!amount || !plan.currency) throw new HttpError(400, "VALIDATION_FAILED", "This plan does not have a self-serve price.");
  const fetchImpl = input.fetchImpl ?? fetch;
  const successUrl = `${input.config.appUrl.replace(/\/$/, "")}/app/billing?checkout=return`;
  const cancelUrl = `${input.config.appUrl.replace(/\/$/, "")}/app/billing?checkout=cancel`;
  if (input.provider === "stripe") {
    if (!input.config.stripeSecretKey) throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Stripe is not configured. Set STRIPE_SECRET_KEY on the worker.");
    const params = new URLSearchParams({
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: input.workspaceId,
      customer_email: input.email,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": plan.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][recurring][interval]": input.interval,
      "line_items[0][price_data][product_data][name]": plan.name,
      "subscription_data[metadata][workspace_id]": input.workspaceId,
      "subscription_data[metadata][plan_code]": plan.code,
      "subscription_data[metadata][interval]": input.interval,
    });
    const session = z.object({ url: z.string().url() }).parse(await stripeRequest(input.config.stripeSecretKey, "POST", "checkout/sessions", params, fetchImpl));
    return { url: session.url };
  }
  if (!input.config.paystackSecretKey) throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Paystack is not configured. Set PAYSTACK_SECRET_KEY on the worker.");
  const response = await fetchImpl("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { authorization: `Bearer ${input.config.paystackSecretKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      amount,
      currency: plan.currency,
      callback_url: successUrl,
      metadata: { workspace_id: input.workspaceId, plan_code: plan.code, interval: input.interval },
    }),
  });
  const payload = z.object({ status: z.boolean(), data: z.object({ authorization_url: z.string().url() }).optional(), message: z.string().optional() }).parse(await response.json());
  if (!response.ok || !payload.status || !payload.data) throw new HttpError(502, "PROVIDER_ERROR", payload.message ?? "Paystack did not start checkout.");
  return { url: payload.data.authorization_url };
}

export async function changeSubscription(input: {
  admin: SupabaseClient;
  config: WorkerConfig;
  workspaceId: string;
  planCode: string;
  interval: "month" | "year";
  provider: "stripe" | "paystack";
  email: string;
  fetchImpl?: FetchImpl;
}): Promise<{ status: "pending_provider_confirmation" | "redirect"; url?: string; message: string }> {
  const blocked = checkoutAllowed(input.planCode);
  if (blocked) throw new HttpError(400, "VALIDATION_FAILED", blocked);
  const { data: subscription } = await input.admin.from("subscriptions").select("provider, provider_subscription_id").eq("workspace_id", input.workspaceId).maybeSingle();
  if (input.provider === "stripe" && subscription?.provider === "stripe" && subscription.provider_subscription_id && input.config.stripeSecretKey) {
    const plan = await planByCode(input.admin, input.planCode);
    const amount = input.interval === "year" ? plan.annual_price_cents : plan.monthly_price_cents;
    const fetchImpl = input.fetchImpl ?? fetch;
    const price = z.object({ id: z.string() }).parse(await stripeRequest(input.config.stripeSecretKey, "POST", "prices", new URLSearchParams({
      currency: plan.currency.toLowerCase(),
      unit_amount: String(amount),
      "recurring[interval]": input.interval,
      "product_data[name]": plan.name,
    }), fetchImpl));
    const current = stripeSubscriptionSchema.extend({ items: z.object({ data: z.array(z.object({ id: z.string() })).min(1) }) }).parse(
      await stripeRequest(input.config.stripeSecretKey, "GET", `subscriptions/${subscription.provider_subscription_id}`, undefined, fetchImpl),
    );
    await stripeRequest(input.config.stripeSecretKey, "POST", `subscriptions/${current.id}`, new URLSearchParams({
      "items[0][id]": current.items.data[0].id,
      "items[0][price]": price.id,
      proration_behavior: "create_prorations",
      "metadata[workspace_id]": input.workspaceId,
      "metadata[plan_code]": plan.code,
      "metadata[interval]": input.interval,
    }), fetchImpl);
    return { status: "pending_provider_confirmation", message: "Stripe accepted the plan change. The workspace plan updates when the signed webhook is verified." };
  }
  const checkout = await createCheckoutSession(input);
  return { status: "redirect", url: checkout.url, message: "Complete checkout. The plan changes only after the provider payment is verified." };
}

export async function cancelSubscription(input: { admin: SupabaseClient; config: WorkerConfig; workspaceId: string; fetchImpl?: FetchImpl }): Promise<{ status: "pending_provider_confirmation"; message: string; cancelAt: string | null }> {
  const { data: subscription } = await input.admin.from("subscriptions").select("id, provider, provider_subscription_id, current_period_end").eq("workspace_id", input.workspaceId).maybeSingle();
  if (!subscription) throw new HttpError(404, "NOT_FOUND", "Subscription not found.");
  if (subscription.provider === "stripe" && subscription.provider_subscription_id) {
    if (!input.config.stripeSecretKey) throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Stripe is not configured. Set STRIPE_SECRET_KEY on the worker.");
    const updated = stripeSubscriptionSchema.parse(await stripeRequest(input.config.stripeSecretKey, "POST", `subscriptions/${subscription.provider_subscription_id}`, new URLSearchParams({ cancel_at_period_end: "true" }), input.fetchImpl ?? fetch));
    const cancelAt = unix(updated.cancel_at ?? undefined) ?? (updated.current_period_end ? unix(updated.current_period_end) : null);
    await input.admin.from("subscriptions").update({ cancel_at: cancelAt }).eq("id", subscription.id);
    return { status: "pending_provider_confirmation", cancelAt, message: "Stripe scheduled the cancellation. Access remains until the confirmed period ends." };
  }
  const cancelAt = subscription.current_period_end ?? new Date().toISOString();
  await input.admin.from("subscriptions").update({ cancel_at: cancelAt }).eq("id", subscription.id);
  return { status: "pending_provider_confirmation", cancelAt, message: "Cancellation is recorded. A Paystack charge is not treated as paid or cancelled until a verified webhook says so. No further renewal will be scheduled by Prospectra." };
}

async function rememberEvent(admin: SupabaseClient, provider: string, eventId: string, eventType: string, payload: unknown): Promise<"duplicate" | "ready"> {
  const { error } = await admin.from("payment_events").insert({ provider, provider_event_id: eventId, event_type: eventType, payload });
  if (!error) return "ready";
  if (error.code !== "23505") throw new HttpError(500, "INTERNAL", error.message);
  const { data } = await admin.from("payment_events").select("processed_at").eq("provider", provider).eq("provider_event_id", eventId).maybeSingle();
  if (data?.processed_at) return "duplicate";
  return "ready";
}

async function finishEvent(admin: SupabaseClient, provider: string, eventId: string, workspaceId: string | null): Promise<void> {
  await admin.from("payment_events").update({ processed_at: new Date().toISOString(), workspace_id: workspaceId }).eq("provider", provider).eq("provider_event_id", eventId);
}

async function saveSubscription(admin: SupabaseClient, config: WorkerConfig, input: {
  workspaceId: string;
  planCode?: string;
  status: SubscriptionState;
  provider: string;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  interval?: string | null;
  currency?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelAt?: string | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    status: input.status,
    provider: input.provider,
    provider_subscription_id: input.providerSubscriptionId ?? null,
    provider_customer_id: input.providerCustomerId ?? null,
    currency: input.currency ?? null,
    current_period_start: input.periodStart ?? null,
    current_period_end: input.periodEnd ?? null,
    cancel_at: input.cancelAt ?? null,
  };
  if (input.interval === "month" || input.interval === "year") patch.billing_interval = input.interval;
  if (input.planCode) {
    const plan = await planByCode(admin, input.planCode);
    patch.plan_id = plan.id;
  }
  const { error } = await admin.from("subscriptions").update(patch).eq("workspace_id", input.workspaceId);
  if (error) throw new HttpError(500, "INTERNAL", error.message);
  await notify(admin, config, input.workspaceId, "subscription_changed", "Subscription updated", `The subscription is ${input.status}. This came from a verified ${input.provider} event.`);
}

async function grantPlanCredits(admin: SupabaseClient, workspaceId: string, planCode: string | undefined, invoiceId: string): Promise<void> {
  if (!planCode) return;
  const plan = await planByCode(admin, planCode);
  if (!plan.included_credits) return;
  const { data: existing } = await admin.from("credit_transactions").select("id").eq("workspace_id", workspaceId).eq("reference_id", invoiceId).eq("reason", "Included plan credits").maybeSingle();
  if (existing) return;
  await admin.rpc("grant_workspace_credits", {
    p_workspace_id: workspaceId,
    p_amount: plan.included_credits,
    p_reason: "Included plan credits",
    p_reference_type: "invoice",
    p_reference_id: invoiceId,
    p_actor: null,
  });
}

export async function handleStripeWebhook(admin: SupabaseClient, config: WorkerConfig, rawBody: string, header: string | undefined, fetchImpl: FetchImpl = fetch): Promise<{ duplicate: boolean }> {
  if (!config.stripeWebhookSecret || !config.stripeSecretKey) {
    throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Stripe webhooks are not configured.");
  }
  if (!verifyStripeSignature(rawBody, header, config.stripeWebhookSecret)) {
    throw new HttpError(400, "VALIDATION_FAILED", "Stripe signature verification failed.");
  }
  const event = z.object({ id: z.string(), type: z.string(), data: z.object({ object: z.record(z.unknown()) }) }).parse(JSON.parse(rawBody) as unknown);
  const state = await rememberEvent(admin, "stripe", event.id, event.type, event);
  if (state === "duplicate") return { duplicate: true };
  const object = event.data.object;
  let workspaceId: string | null = null;
  if (event.type === "checkout.session.completed" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscriptionId = String(object.subscription ?? object.id ?? "");
    const subscription = stripeSubscriptionSchema.parse(await stripeRequest(config.stripeSecretKey, "GET", `subscriptions/${subscriptionId}`, undefined, fetchImpl));
    const status = subscriptionStateFromProvider(subscription.status);
    workspaceId = subscription.metadata?.workspace_id ?? null;
    if (status && workspaceId) {
      await saveSubscription(admin, config, {
        workspaceId,
        planCode: subscription.metadata?.plan_code,
        status,
        provider: "stripe",
        providerSubscriptionId: subscription.id,
        providerCustomerId: customerId(subscription.customer),
        interval: subscription.metadata?.interval ?? null,
        currency: subscription.currency?.toUpperCase() ?? null,
        periodStart: unix(subscription.current_period_start),
        periodEnd: unix(subscription.current_period_end),
        cancelAt: unix(subscription.cancel_at ?? undefined),
      });
    }
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoiceId = String(object.id ?? "");
    const invoice = stripeInvoiceSchema.parse(await stripeRequest(config.stripeSecretKey, "GET", `invoices/${invoiceId}`, undefined, fetchImpl));
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
    const subscription = subscriptionId
      ? stripeSubscriptionSchema.parse(await stripeRequest(config.stripeSecretKey, "GET", `subscriptions/${subscriptionId}`, undefined, fetchImpl))
      : null;
    workspaceId = subscription?.metadata?.workspace_id ?? null;
    if (workspaceId) {
      const paid = invoice.status === "paid";
      await admin.from("invoices").upsert({
        workspace_id: workspaceId,
        provider: "stripe",
        provider_invoice_id: invoice.id,
        status: paid ? "paid" : "failed",
        amount_cents: paid ? invoice.amount_paid ?? 0 : invoice.amount_due ?? 0,
        currency: invoice.currency.toUpperCase(),
        hosted_url: invoice.hosted_invoice_url ?? null,
      }, { onConflict: "provider,provider_invoice_id" });
      if (paid) {
        await grantPlanCredits(admin, workspaceId, subscription?.metadata?.plan_code, invoice.id);
        await notify(admin, config, workspaceId, "payment_received", "Payment received", "Stripe confirmed a paid invoice.");
      } else {
        await admin.from("subscriptions").update({ status: "past_due" }).eq("workspace_id", workspaceId);
        await notify(admin, config, workspaceId, "subscription_changed", "Payment failed", "Stripe reported a failed invoice. The subscription is past due.");
      }
    }
  }
  if (event.type === "charge.refunded") {
    const charge = stripeChargeSchema.parse(await stripeRequest(config.stripeSecretKey, "GET", `charges/${String(object.id ?? "")}`, undefined, fetchImpl));
    workspaceId = charge.metadata?.workspace_id ?? null;
    if (workspaceId && charge.amount_refunded > 0) {
      await admin.from("refunds").upsert({
        workspace_id: workspaceId,
        provider: "stripe",
        provider_refund_id: charge.id,
        amount_cents: charge.amount_refunded,
        currency: charge.currency.toUpperCase(),
        status: "succeeded",
      }, { onConflict: "provider,provider_refund_id" });
    }
  }
  await finishEvent(admin, "stripe", event.id, workspaceId);
  return { duplicate: false };
}

export async function handlePaystackWebhook(admin: SupabaseClient, config: WorkerConfig, rawBody: string, header: string | undefined, fetchImpl: FetchImpl = fetch): Promise<{ duplicate: boolean }> {
  if (!config.paystackWebhookSecret || !config.paystackSecretKey) {
    throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Paystack webhooks are not configured.");
  }
  if (!verifyPaystackSignature(rawBody, header, config.paystackWebhookSecret)) {
    throw new HttpError(400, "VALIDATION_FAILED", "Paystack signature verification failed.");
  }
  const event = z.object({ event: z.string(), data: z.record(z.unknown()) }).parse(JSON.parse(rawBody) as unknown);
  const reference = String(event.data.reference ?? event.data.id ?? "");
  if (!reference) throw new HttpError(400, "VALIDATION_FAILED", "Paystack event is missing a reference.");
  const eventId = `${event.event}:${reference}`;
  const state = await rememberEvent(admin, "paystack", eventId, event.event, event);
  if (state === "duplicate") return { duplicate: true };
  const verified = z.object({
    status: z.boolean(),
    data: z.object({
      status: z.string(),
      reference: z.string(),
      amount: z.number(),
      currency: z.string(),
      metadata: z.union([z.record(z.unknown()), z.string()]).optional(),
    }),
  }).parse(await (await fetchImpl(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${config.paystackSecretKey}` },
  })).json());
  const metadata = typeof verified.data.metadata === "string" ? {} : verified.data.metadata ?? {};
  const workspaceId = typeof metadata.workspace_id === "string" ? metadata.workspace_id : null;
  const planCode = typeof metadata.plan_code === "string" ? metadata.plan_code : undefined;
  const interval = typeof metadata.interval === "string" ? metadata.interval : null;
  if (workspaceId && verified.data.status === "success" && event.event === "charge.success") {
    const start = new Date();
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + (interval === "year" ? 12 : 1));
    await saveSubscription(admin, config, {
      workspaceId,
      planCode,
      status: "active",
      provider: "paystack",
      providerSubscriptionId: verified.data.reference,
      interval,
      currency: verified.data.currency.toUpperCase(),
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    });
    await admin.from("invoices").upsert({
      workspace_id: workspaceId,
      provider: "paystack",
      provider_invoice_id: verified.data.reference,
      status: "paid",
      amount_cents: verified.data.amount,
      currency: verified.data.currency.toUpperCase(),
    }, { onConflict: "provider,provider_invoice_id" });
    await grantPlanCredits(admin, workspaceId, planCode, verified.data.reference);
    await notify(admin, config, workspaceId, "payment_received", "Payment received", "Paystack verified a successful charge.");
  }
  if (workspaceId && verified.data.status !== "success" && (event.event === "charge.failed" || event.event === "invoice.payment_failed")) {
    await admin.from("subscriptions").update({ status: "past_due" }).eq("workspace_id", workspaceId);
    await admin.from("invoices").upsert({
      workspace_id: workspaceId,
      provider: "paystack",
      provider_invoice_id: verified.data.reference,
      status: "failed",
      amount_cents: verified.data.amount,
      currency: verified.data.currency.toUpperCase(),
    }, { onConflict: "provider,provider_invoice_id" });
    await notify(admin, config, workspaceId, "subscription_changed", "Payment failed", "Paystack verified a failed charge. The subscription is past due.");
  }
  await finishEvent(admin, "paystack", eventId, workspaceId);
  return { duplicate: false };
}

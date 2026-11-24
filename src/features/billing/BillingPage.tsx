import { browserCheckoutResult, checkoutAllowed, formatMoney } from "@prospectra/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { billingService } from "@/services/billing-service";

function money(cents: number, currency: string | null | undefined): string {
  if (!currency) return `${cents} (currency not set)`;
  try {
    return formatMoney(cents, currency);
  } catch {
    return `${cents} ${currency}`;
  }
}

export function BillingPage() {
  return (
    <WorkspaceGate>
      <BillingContent />
    </WorkspaceGate>
  );
}

function BillingContent() {
  const { activeWorkspaceId } = useWorkspace();
  const workspaceId = activeWorkspaceId!;
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const checkoutState = browserCheckoutResult(params);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [provider, setProvider] = useState<"stripe" | "paystack">("stripe");
  const [legalName, setLegalName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const billing = useQuery({ queryKey: ["billing", workspaceId], queryFn: () => billingService.load(workspaceId) });
  const checkout = useMutation({
    mutationFn: (planCode: string) => billingService.checkout({ workspaceId, planCode, interval, provider }),
    onSuccess: (result) => {
      if (result.url) window.location.assign(result.url);
    },
  });
  const change = useMutation({
    mutationFn: (planCode: string) => billingService.change({ workspaceId, planCode, interval, provider }),
    onSuccess: async (result) => {
      if (result.url) window.location.assign(result.url);
      await queryClient.invalidateQueries({ queryKey: ["billing", workspaceId] });
    },
  });
  const cancel = useMutation({
    mutationFn: () => billingService.cancel(workspaceId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["billing", workspaceId] }),
  });
  const saveProfile = useMutation({
    mutationFn: () => billingService.saveProfile(workspaceId, { legal_name: legalName, billing_email: billingEmail, tax_id: taxId }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["billing", workspaceId] }),
  });

  const data = billing.data;
  const current = data?.plans.find((plan) => plan.id === data.subscription?.plan_id);
  const currency = data?.subscription?.currency || current?.currency;
  const usage = new Map<string, number>();
  for (const row of data?.ledger ?? []) {
    if (row.amount < 0) usage.set(row.reason, (usage.get(row.reason) ?? 0) + Math.abs(row.amount));
  }

  return (
    <>
      <Seo title="Billing" />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">Balances come from the credit ledger. A return from checkout is not a payment confirmation.</p>
        </div>
        {checkoutState === "pending_provider_confirmation" ? (
          <Card>
            <CardHeader>
              <CardTitle>Waiting for the provider</CardTitle>
              <CardDescription>The subscription changes after a verified webhook. This page does not mark the payment successful.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
        {checkoutState === "cancelled" ? <Badge variant="warning">Checkout was cancelled before payment.</Badge> : null}
        {billing.isError ? <p className="text-sm text-destructive">{getErrorMessage(billing.error)}</p> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Current plan</CardDescription>
              <CardTitle>{current?.name ?? "Not loaded"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {data?.subscription?.status ?? "No subscription"} · {data?.subscription?.billing_interval ?? "interval not set"} · {currency ?? "currency not set"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Credit balance</CardDescription>
              <CardTitle>{data?.account ? data.account.balance : "—"}</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.account && data.account.balance < data.account.low_balance_threshold ? <Badge variant="warning">Below the low-credit threshold</Badge> : <span className="text-sm text-muted-foreground">Held reservations: {data?.reservations.length ?? 0}</span>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Latest usage</CardDescription>
              <CardTitle>{[...usage.values()].reduce((sum, value) => sum + value, 0)} credits</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Grouped from the latest 50 ledger rows.</CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
            <CardDescription>Prices use each plan’s stored currency.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={interval === "month" ? "default" : "outline"} onClick={() => setInterval("month")}>Monthly</Button>
              <Button type="button" variant={interval === "year" ? "default" : "outline"} onClick={() => setInterval("year")}>Annual</Button>
              <Button type="button" variant={provider === "stripe" ? "default" : "outline"} onClick={() => setProvider("stripe")}>Stripe</Button>
              <Button type="button" variant={provider === "paystack" ? "default" : "outline"} onClick={() => setProvider("paystack")}>Paystack</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(data?.plans ?? []).map((plan) => {
                const blocked = checkoutAllowed(plan.code);
                const price = interval === "year" ? plan.annual_price_cents : plan.monthly_price_cents;
                const currentPlan = plan.id === data?.subscription?.plan_id;
                return (
                  <div key={plan.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-medium">{plan.name}</h2>
                      {currentPlan ? <Badge>Current</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm">{money(price, plan.currency)} / {interval}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{plan.included_credits} included credits · {plan.team_member_limit ?? "Unlimited"} members · {plan.prospect_limit ?? "Unlimited"} prospects · {plan.campaign_limit ?? "Unlimited"} campaigns</p>
                    <p className="text-sm text-muted-foreground">AI allowance {plan.ai_allowance ?? "Unlimited"} · enrichment allowance {plan.enrichment_allowance ?? "Unlimited"}</p>
                    <div className="mt-3 flex gap-2">
                      <Button type="button" disabled={Boolean(blocked) || checkout.isPending} onClick={() => checkout.mutate(plan.code)}>Checkout</Button>
                      <Button type="button" variant="outline" disabled={Boolean(blocked) || change.isPending} onClick={() => change.mutate(plan.code)}>Change plan</Button>
                    </div>
                    {blocked ? <p className="mt-2 text-xs text-muted-foreground">{blocked}</p> : null}
                  </div>
                );
              })}
            </div>
            {checkout.isError || change.isError ? <p className="text-sm text-destructive">{getErrorMessage(checkout.error ?? change.error)}</p> : null}
            {change.data && !change.data.url ? <p className="text-sm">{change.data.message}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Usage breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {[...usage.entries()].map(([reason, amount]) => <li key={reason}>{reason}: {amount}</li>)}
              {usage.size === 0 ? <li className="text-muted-foreground">No credit consumption in the latest ledger rows.</li> : null}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.invoices ?? []).map((invoice) => (
              <p key={invoice.id}>{invoice.status} · {money(invoice.amount_cents, invoice.currency)} · {invoice.provider}{invoice.hosted_url ? ` · ${invoice.hosted_url}` : ""}</p>
            ))}
            {(data?.invoices.length ?? 0) === 0 ? <p className="text-muted-foreground">No invoices yet.</p> : null}
            {(data?.refunds ?? []).map((refund) => <p key={refund.id}>Refund {refund.status} · {money(refund.amount_cents, refund.currency)} · {refund.provider}</p>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Billing information</CardTitle>
            <CardDescription>Workspace owners and admins can save this profile. Card numbers are not stored.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Input aria-label="Legal name" placeholder={data?.profile?.legal_name ?? "Legal name"} value={legalName} onChange={(event) => setLegalName(event.target.value)} />
            <Input aria-label="Billing email" placeholder={data?.profile?.billing_email ?? "Billing email"} value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} />
            <Input aria-label="Tax id" placeholder={data?.profile?.tax_id ?? "Tax id"} value={taxId} onChange={(event) => setTaxId(event.target.value)} />
            <Button type="button" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>Save billing information</Button>
            {saveProfile.isError ? <p className="text-sm text-destructive">{getErrorMessage(saveProfile.error)}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cancellation</CardTitle>
            <CardDescription>{data?.subscription?.cancel_at ? `Cancellation is scheduled for ${data.subscription.cancel_at}.` : "Cancellation is confirmed by the provider, not by this button alone."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button type="button" variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Request cancellation</Button>
            {cancel.data ? <p className="text-sm">{cancel.data.message}</p> : null}
            {cancel.isError ? <p className="text-sm text-destructive">{getErrorMessage(cancel.error)}</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

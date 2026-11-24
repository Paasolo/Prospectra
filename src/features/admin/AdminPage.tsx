import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/shared/Seo";
import { useAuth } from "@/hooks/use-auth";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { adminService } from "@/services/admin-service";

const MODULES = ["overview", "users", "workspaces", "subscriptions", "plans", "credits", "jobs", "webhooks", "audit", "flags", "settings", "integrations", "health"] as const;

export function AdminPage() {
  const auth = useAuth();
  const supabase = getSupabaseInitResult();
  const userId = auth.status === "authenticated" ? auth.userId : "";
  const access = useQuery({
    queryKey: ["platform-admin", userId],
    enabled: auth.status === "authenticated",
    queryFn: () => adminService.isAdmin(userId),
  });
  const [module, setModule] = useState<(typeof MODULES)[number]>("overview");
  const [planId, setPlanId] = useState("");
  const [currency, setCurrency] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [jobId, setJobId] = useState("");
  const panel = useQuery({
    queryKey: ["admin", module],
    enabled: access.data === true,
    queryFn: () => loadModule(module),
  });
  const planUpdate = useMutation({
    mutationFn: () => adminService.updatePlan({ planId, ...(currency ? { currency } : {}) }),
    onSuccess: async () => panel.refetch(),
  });
  const creditUpdate = useMutation({
    mutationFn: () => adminService.credits({ workspaceId, amount: Number(amount), reason }),
    onSuccess: async () => panel.refetch(),
  });
  const retry = useMutation({
    mutationFn: () => adminService.retry(jobId),
    onSuccess: async () => panel.refetch(),
  });

  if (supabase.status === "unconfigured") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card><CardHeader><CardTitle>Supabase unconfigured</CardTitle><CardDescription>{supabase.reason}</CardDescription></CardHeader></Card>
      </main>
    );
  }
  if (auth.status !== "authenticated") {
    return <main className="mx-auto max-w-3xl p-6"><Button asChild><Link to="/login">Sign in</Link></Button></main>;
  }
  if (access.isSuccess && !access.data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Platform admin access is required</CardTitle>
            <CardDescription>The worker checks the platform administrator table. This screen does not grant access.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <Seo title="Platform admin" />
      <div>
        <h1 className="font-display text-3xl font-semibold">Platform administration</h1>
        <p className="text-sm text-muted-foreground">Aggregates and account identity only. Message bodies and prospect content are not loaded.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {MODULES.map((item) => (
          <Button key={item} type="button" variant={module === item ? "default" : "outline"} onClick={() => setModule(item)}>{item}</Button>
        ))}
      </div>
      {panel.isError ? <p className="text-sm text-destructive">{getErrorMessage(panel.error)}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>{module}</CardTitle>
          {module === "overview" && panel.data && "subscriptionSampleLimited" in panel.data && panel.data.subscriptionSampleLimited ? <CardDescription>Subscription distribution uses the first 1,000 rows.</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(panel.data ?? {}, null, 2)}</pre>
          {module === "plans" ? (
            <div className="grid gap-2 md:grid-cols-3">
              <Input aria-label="Plan id" placeholder="Plan id" value={planId} onChange={(event) => setPlanId(event.target.value)} />
              <Input aria-label="Currency" placeholder="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)} />
              <Button type="button" onClick={() => planUpdate.mutate()}>Update plan currency</Button>
            </div>
          ) : null}
          {module === "credits" ? (
            <div className="grid gap-2 md:grid-cols-4">
              <Input aria-label="Workspace id" placeholder="Workspace id" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
              <Input aria-label="Amount" placeholder="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
              <Input aria-label="Reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
              <Button type="button" onClick={() => creditUpdate.mutate()}>Adjust credits</Button>
            </div>
          ) : null}
          {module === "jobs" ? (
            <div className="flex gap-2">
              <Input aria-label="Job id" placeholder="Dead-letter job id" value={jobId} onChange={(event) => setJobId(event.target.value)} />
              <Button type="button" onClick={() => retry.mutate()}>Retry job</Button>
            </div>
          ) : null}
          {module === "flags" && panel.data && "flags" in panel.data ? (
            <div className="flex flex-wrap gap-2">
              {panel.data.flags.map((flag) => (
                <Button key={flag.key} type="button" variant="outline" onClick={() => void adminService.flags({ key: flag.key, enabled: !flag.enabled }).then(() => panel.refetch())}>
                  {flag.key} <Badge className="ml-2">{flag.enabled ? "on" : "off"}</Badge>
                </Button>
              ))}
            </div>
          ) : null}
          {planUpdate.isError || creditUpdate.isError || retry.isError ? <p className="text-sm text-destructive">{getErrorMessage(planUpdate.error ?? creditUpdate.error ?? retry.error)}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}

async function loadModule(module: (typeof MODULES)[number]) {
  if (module === "overview") return adminService.overview();
  if (module === "users") return adminService.users();
  if (module === "workspaces") return adminService.workspaces();
  if (module === "subscriptions") return adminService.subscriptions();
  if (module === "plans") return adminService.plans();
  if (module === "credits") return adminService.overview();
  if (module === "jobs") return adminService.jobs();
  if (module === "webhooks") return adminService.webhooks();
  if (module === "audit") return adminService.audit();
  if (module === "flags") return adminService.flags();
  if (module === "settings") return adminService.settings();
  if (module === "integrations") return adminService.integrations();
  return adminService.health();
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { dashboardService } from "@/services/dashboard-service";

function MetricCard({
  label,
  value,
  unavailable,
}: {
  label: string;
  value: string | number;
  unavailable?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{unavailable ? "Unavailable" : value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function DashboardPage() {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const supabase = getSupabaseInitResult();

  const metricsQuery = useQuery({
    queryKey: ["dashboard-metrics", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId) && supabase.status === "configured",
    queryFn: () => dashboardService.getMetrics(activeWorkspaceId!),
  });

  const metrics = metricsQuery.data;
  const chartData = metrics
    ? [
        { name: "Prospects", value: metrics.totalProspects },
        { name: "Companies", value: metrics.companiesDiscovered },
        { name: "Campaigns", value: metrics.activeCampaigns },
        { name: "Replies", value: metrics.repliesReceived },
        { name: "Meetings", value: metrics.meetingsBooked },
      ]
    : [];

  return (
    <>
      <Seo title="Dashboard" />
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {activeWorkspace
                ? `Workspace: ${activeWorkspace.name}`
                : "Select or create a workspace to load metrics."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/app/agent">Start outbound agent</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/icp">Create ICP</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/website-analysis">Analyse website</Link>
            </Button>
          </div>
        </div>

        {supabase.status === "unconfigured" ? (
          <Card>
            <CardHeader>
              <CardTitle>Supabase unconfigured</CardTitle>
              <CardDescription>{supabase.reason}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Dashboard metrics require a configured project. Empty zeros are not shown as live data while the
                backend is unavailable.
              </p>
              <Badge className="mt-3" variant="warning">
                Configuration required
              </Badge>
            </CardContent>
          </Card>
        ) : null}

        {!activeWorkspaceId && supabase.status === "configured" ? (
          <Card>
            <CardHeader>
              <CardTitle>No workspace selected</CardTitle>
              <CardDescription>Create a workspace to begin tracking prospects and campaigns.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/onboarding">Start onboarding</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {metricsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading workspace metrics…</p>
        ) : null}

        {metricsQuery.isError ? (
          <p className="text-sm text-destructive">{(metricsQuery.error as Error).message}</p>
        ) : null}

        {metrics ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Total prospects" value={metrics.totalProspects} />
              <MetricCard label="New prospects" value={metrics.newProspects} />
              <MetricCard label="Qualified prospects" value={metrics.qualifiedProspects} />
              <MetricCard label="Companies discovered" value={metrics.companiesDiscovered} />
              <MetricCard label="Active campaigns" value={metrics.activeCampaigns} />
              <MetricCard label="Emails attempted" value={metrics.emailsAttempted} />
              <MetricCard label="Replies received" value={metrics.repliesReceived} />
              <MetricCard label="Meetings booked" value={metrics.meetingsBooked} />
              <MetricCard
                label="Remaining credits"
                value={metrics.remainingCredits ?? "—"}
                unavailable={metrics.unavailable.includes("remainingCredits")}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Activity snapshot</CardTitle>
                <CardDescription>
                  Values are counted from your workspace tables. A new workspace correctly shows zeros.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--color-brand-electric)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </>
  );
}

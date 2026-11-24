import { formatMoney } from "@prospectra/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { analyticsService, type AnalyticsQuery, type AnalyticsResponse } from "@/services/analytics-service";

function startOfRange(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function ReportsPage() {
  return (
    <WorkspaceGate>
      <AnalyticsScreen title="Reports" mode="campaigns" />
    </WorkspaceGate>
  );
}

export function PerformancePage() {
  return (
    <WorkspaceGate>
      <AnalyticsScreen title="Performance" mode="sales" />
    </WorkspaceGate>
  );
}

function AnalyticsScreen({ title, mode }: { title: string; mode: "campaigns" | "sales" }) {
  const { activeWorkspaceId } = useWorkspace();
  const workspaceId = activeWorkspaceId!;
  const [from, setFrom] = useState(startOfRange(30).slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [campaignId, setCampaignId] = useState("");
  const [icpId, setIcpId] = useState("");
  const [source, setSource] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [industry, setIndustry] = useState("");
  const [geography, setGeography] = useState("");
  const query = useMemo<AnalyticsQuery>(() => ({
    workspaceId,
    from: new Date(`${from}T00:00:00.000Z`).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    ...(campaignId ? { campaignId } : {}),
    ...(icpId ? { icpId } : {}),
    ...(source ? { source } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(industry ? { industry } : {}),
    ...(geography ? { geography } : {}),
  }), [workspaceId, from, to, campaignId, icpId, source, ownerId, industry, geography]);
  const summary = useQuery({ queryKey: ["analytics", query], queryFn: () => analyticsService.summary(query) });
  const downloadCsv = () => {
    if (!summary.data) return;
    const blob = new Blob([summary.data.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prospectra-analytics.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadPdf = async () => {
    const blob = await analyticsService.pdf(query);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prospectra-report.pdf";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Seo title={title} />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">Figures are counted from workspace records. A rate is blank when its denominator is zero.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Input aria-label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input aria-label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Input aria-label="Campaign id" placeholder="Campaign id" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} />
          <Input aria-label="ICP id" placeholder="ICP id" value={icpId} onChange={(event) => setIcpId(event.target.value)} />
          <Input aria-label="Source" placeholder="Source" value={source} onChange={(event) => setSource(event.target.value)} />
          <Input aria-label="Team member" placeholder="Team member id" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} />
          <Input aria-label="Industry" placeholder="Industry" value={industry} onChange={(event) => setIndustry(event.target.value)} />
          <Input aria-label="Geography" placeholder="Geography" value={geography} onChange={(event) => setGeography(event.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={downloadCsv} disabled={!summary.data}>Export CSV</Button>
          <Button type="button" variant="outline" onClick={() => void downloadPdf()}>Export PDF</Button>
        </div>
        {summary.isError ? <p className="text-sm text-destructive">{getErrorMessage(summary.error)}</p> : null}
        {summary.data?.truncated ? <p className="text-sm text-muted-foreground">This range matched the 5,000 row query limit. Narrow the dates for a complete count.</p> : null}
        {summary.data ? <Charts data={summary.data} mode={mode} /> : null}
      </div>
    </>
  );
}

function Charts({ data, mode }: { data: AnalyticsResponse; mode: "campaigns" | "sales" }) {
  const funnel = [
    { label: "Discovered", count: data.prospects.discovered },
    { label: "Qualified", count: data.prospects.qualified },
    { label: "Contacted", count: data.prospects.contacted },
    { label: "Engaged", count: data.prospects.engaged },
    { label: "Meetings", count: data.prospects.meetingsBooked },
    { label: "Customers", count: data.prospects.customersAcquired },
  ];
  const campaignBars = [
    { label: "Enrolled", count: data.campaigns.enrolled },
    { label: "Attempted", count: data.campaigns.attempted },
    { label: "Accepted", count: data.campaigns.accepted },
    { label: "Delivered", count: data.campaigns.delivered },
    { label: "Bounced", count: data.campaigns.bounced },
    { label: "Replies", count: data.campaigns.replies },
    { label: "Unsubscribes", count: data.campaigns.unsubscribes },
    { label: "Complaints", count: data.campaigns.complaints },
    { label: "Failures", count: data.campaigns.failures },
  ];
  const comparison = mode === "sales" ? data.breakdowns.source : data.breakdowns.industry;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Prospect conversion" value={data.rates.prospectConversion === null ? "No discovered prospects" : String(data.rates.prospectConversion)} />
        <Metric label="Confirmed deliveries" value={String(data.campaigns.delivered)} />
        <Metric label="Time to engagement" value={data.sales.timeToEngagementHours === null ? "No engagement events" : `${data.sales.timeToEngagementHours} hours`} />
      </div>
      <Card>
        <CardHeader><CardTitle>{mode === "sales" ? "Prospect funnel" : "Campaign activity"}</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mode === "sales" ? funnel : campaignBars} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="label" width={110} />
              <Tooltip />
              <Bar dataKey="count" fill="currentColor" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Credit consumption</CardTitle></CardHeader>
        <CardContent className="h-64">
          {data.creditSeries.length === 0 ? <p className="text-sm text-muted-foreground">No credit consumption in this range.</p> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.creditSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="consumed" stroke="currentColor" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{mode === "sales" ? "Source comparison" : "Industry mix"}</CardTitle></CardHeader>
          <CardContent className="h-64">
            {comparison.length === 0 ? <p className="text-sm text-muted-foreground">No matching prospects.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={comparison} dataKey="count" nameKey="label" innerRadius={50} outerRadius={80}>
                    {comparison.map((entry) => <Cell key={entry.label} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Revenue by currency</CardTitle><CardDescription>Paid invoices only. Currencies are not combined.</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.finance.revenueByCurrency.length === 0 ? <p className="text-muted-foreground">No paid invoices in this range.</p> : data.finance.revenueByCurrency.map((row) => <p key={row.currency}>{formatSafe(row.amountCents, row.currency)}</p>)}
            <p>Credits consumed: {data.finance.creditsConsumed}</p>
            <p>AI requests: {data.usage?.aiRequests ?? "Not available"}</p>
            <p>Enrichment jobs: {data.usage?.enrichmentJobs ?? "Not available"}</p>
            <p>Provider searches: {data.usage?.providerSearches ?? "Not available"}</p>
            <p>Workspace activities: {data.usage?.activities ?? "Not available"}</p>
            <p>Positive replies: not stored on email records.</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Breakdown</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><th>Group</th><th>Label</th><th>Count</th></tr></thead>
            <tbody>
              {(["industry", "geography", "source", "owner", "icp"] as const).flatMap((group) => data.breakdowns[group].map((row) => (
                <tr key={`${group}-${row.label}`}><td>{group}</td><td>{row.label}</td><td>{row.count}</td></tr>
              )))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Definitions</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {Object.entries(data.definitions).map(([key, value]) => <p key={key}><span className="text-foreground">{key}.</span> {value}</p>)}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader>
    </Card>
  );
}

function formatSafe(cents: number, currency: string): string {
  try {
    return formatMoney(cents, currency);
  } catch {
    return `${cents} ${currency}`;
  }
}

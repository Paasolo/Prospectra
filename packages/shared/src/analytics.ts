export const METRIC_DEFINITIONS = {
  prospectsDiscovered: "Prospects created in the selected range, excluding merged records.",
  prospectsQualified: "Discovered prospects whose current stage is qualified or further along.",
  prospectsContacted: "Discovered prospects whose current stage is contacted or further along.",
  prospectsEngaged: "Discovered prospects whose current stage is engaged, meeting booked, or customer.",
  meetingsBooked: "Meetings in range with provider confirmation.",
  customersAcquired: "Discovered prospects whose current stage is customer.",
  prospectConversion: "Customers acquired divided by prospects discovered. Null when none were discovered.",
  messagesAttempted: "Outbound email rows in range.",
  messagesAccepted: "Outbound rows whose delivery state is accepted or delivered.",
  confirmedDeliveries: "Outbound rows whose delivery state is delivered.",
  bounces: "Outbound rows whose delivery state is bounced.",
  replies: "Inbound email rows in range.",
  positiveReplies: "Not shown. Reply sentiment is not stored on email records.",
  unsubscribes: "Enrollments stopped for unsubscribe, plus suppression rows in range.",
  complaints: "Enrollments stopped for complaint.",
  campaignFailures: "Outreach jobs in range with status failed or dead_letter.",
  subscriptionRevenue: "Sum of paid invoices grouped by currency. Currencies are not combined.",
} as const;

const FURTHER = new Set(["QUALIFIED", "CONTACTED", "ENGAGED", "MEETING_BOOKED", "CUSTOMER"]);
const CONTACTED = new Set(["CONTACTED", "ENGAGED", "MEETING_BOOKED", "CUSTOMER"]);
const ENGAGED = new Set(["ENGAGED", "MEETING_BOOKED", "CUSTOMER"]);

export type AnalyticsInput = {
  prospects: Array<{ createdAt: string; stage: string; ownerId?: string | null; industry?: string | null; location?: string | null; source?: string | null; icpId?: string | null }>;
  meetings: Array<{ createdAt: string; providerConfirmed: boolean }>;
  messages: Array<{ createdAt: string; direction: string; deliveryState: string; campaignId?: string | null }>;
  enrollments: Array<{ createdAt: string; stopReason?: string | null; campaignId?: string | null }>;
  jobs: Array<{ createdAt: string; status: string; campaignId?: string | null }>;
  suppressions: Array<{ createdAt: string }>;
  invoices: Array<{ createdAt: string; status: string; amountCents: number; currency: string }>;
  credits: Array<{ createdAt: string; amount: number; reason: string }>;
  subscriptions: Array<{ planCode: string; status: string }>;
  engagementHours?: number[];
  usage?: { aiRequests: number; enrichmentJobs: number; providerSearches: number; activities: number };
};

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

export function computeAnalytics(input: AnalyticsInput) {
  const discovered = input.prospects.length;
  const qualified = input.prospects.filter((row) => FURTHER.has(row.stage)).length;
  const contacted = input.prospects.filter((row) => CONTACTED.has(row.stage)).length;
  const engaged = input.prospects.filter((row) => ENGAGED.has(row.stage)).length;
  const customers = input.prospects.filter((row) => row.stage === "CUSTOMER").length;
  const meetings = input.meetings.filter((row) => row.providerConfirmed).length;
  const outbound = input.messages.filter((row) => row.direction === "outbound");
  const revenue = new Map<string, number>();
  for (const invoice of input.invoices) {
    if (invoice.status !== "paid") continue;
    revenue.set(invoice.currency, (revenue.get(invoice.currency) ?? 0) + invoice.amountCents);
  }
  const countBy = (values: Array<string | null | undefined>) => {
    const buckets = new Map<string, number>();
    for (const value of values) {
      const key = value?.trim() || "Unknown";
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([label, count]) => ({ label, count }));
  };
  return {
    definitions: METRIC_DEFINITIONS,
    prospects: { discovered, qualified, contacted, engaged, meetingsBooked: meetings, customersAcquired: customers },
    rates: { prospectConversion: rate(customers, discovered), meetingRate: rate(meetings, discovered) },
    campaigns: {
      enrolled: input.enrollments.length,
      attempted: outbound.length,
      accepted: outbound.filter((row) => row.deliveryState === "accepted" || row.deliveryState === "delivered").length,
      delivered: outbound.filter((row) => row.deliveryState === "delivered").length,
      bounced: outbound.filter((row) => row.deliveryState === "bounced").length,
      replies: input.messages.filter((row) => row.direction === "inbound").length,
      positiveReplies: null,
      unsubscribes: input.enrollments.filter((row) => row.stopReason === "unsubscribe").length + input.suppressions.length,
      complaints: input.enrollments.filter((row) => row.stopReason === "complaint").length,
      failures: input.jobs.filter((row) => row.status === "failed" || row.status === "dead_letter").length,
    },
    breakdowns: {
      industry: countBy(input.prospects.map((row) => row.industry)),
      geography: countBy(input.prospects.map((row) => row.location)),
      source: countBy(input.prospects.map((row) => row.source)),
      owner: countBy(input.prospects.map((row) => row.ownerId)),
      icp: countBy(input.prospects.map((row) => row.icpId)),
    },
    finance: {
      revenueByCurrency: [...revenue.entries()].map(([currency, amountCents]) => ({ currency, amountCents })),
      planDistribution: countBy(input.subscriptions.map((row) => row.planCode)),
      creditsConsumed: input.credits.filter((row) => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0),
    },
    creditSeries: creditSeries(input.credits),
    sales: {
      timeToEngagementHours: average(input.engagementHours ?? []),
    },
    usage: input.usage ?? null,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

function creditSeries(credits: AnalyticsInput["credits"]): Array<{ date: string; consumed: number }> {
  const byDay = new Map<string, number>();
  for (const row of credits) {
    if (row.amount >= 0) continue;
    const date = row.createdAt.slice(0, 10);
    byDay.set(date, (byDay.get(date) ?? 0) + Math.abs(row.amount));
  }
  return [...byDay.entries()].map(([date, consumed]) => ({ date, consumed }));
}

export type AnalyticsSummary = ReturnType<typeof computeAnalytics>;

export function analyticsToCsv(summary: AnalyticsSummary): string {
  const lines = ["metric,value", `prospects_discovered,${summary.prospects.discovered}`, `customers_acquired,${summary.prospects.customersAcquired}`, `messages_attempted,${summary.campaigns.attempted}`, `confirmed_deliveries,${summary.campaigns.delivered}`];
  for (const row of summary.finance.revenueByCurrency) {
    lines.push(`revenue_${row.currency},${row.amountCents}`);
  }
  return lines.join("\n");
}

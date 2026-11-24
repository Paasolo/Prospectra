import { computeAnalytics, type AnalyticsSummary } from "@prospectra/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "../http/errors.js";

export type AnalyticsFilters = {
  workspaceId: string;
  from: string;
  to: string;
  campaignId?: string;
  icpId?: string;
  source?: string;
  ownerId?: string;
  industry?: string;
  geography?: string;
};

const LIMIT = 5000;

async function subscriptionPlans(admin: SupabaseClient, rows: Array<{ status: string; plan_id: string }>) {
  const ids = [...new Set(rows.map((row) => row.plan_id))];
  const { data: plans } = ids.length ? await admin.from("plans").select("id, code").in("id", ids) : { data: [] };
  const codes = new Map((plans ?? []).map((plan) => [plan.id, plan.code]));
  return rows.map((row) => ({ planCode: codes.get(row.plan_id) ?? "unknown", status: row.status }));
}

export async function summarizeWorkspace(admin: SupabaseClient, userId: string, filters: AnalyticsFilters): Promise<AnalyticsSummary & { truncated: boolean }> {
  const { data: member, error: memberError } = await admin.from("workspace_members").select("user_id").eq("workspace_id", filters.workspaceId).eq("user_id", userId).maybeSingle();
  if (memberError) throw new HttpError(500, "INTERNAL", memberError.message);
  if (!member) throw new HttpError(403, "FORBIDDEN", "You are not a member of this workspace.");

  let prospectIds: Set<string> | null = null;
  if (filters.icpId) {
    const { data: searches } = await admin.from("discovery_searches").select("id").eq("workspace_id", filters.workspaceId).eq("icp_profile_id", filters.icpId);
    const searchIds = (searches ?? []).map((row) => row.id);
    const { data: results } = searchIds.length
      ? await admin.from("discovery_search_results").select("prospect_id").in("search_id", searchIds).limit(LIMIT)
      : { data: [] };
    prospectIds = new Set((results ?? []).map((row) => row.prospect_id).filter((id): id is string => Boolean(id)));
  }

  const prospectsQuery = admin.from("prospects").select("id, created_at, stage, owner_user_id, location, source, company_id").eq("workspace_id", filters.workspaceId).is("merged_into_prospect_id", null).gte("created_at", filters.from).lte("created_at", filters.to).limit(LIMIT);
  const messagesQuery = admin.from("email_messages").select("created_at, direction, delivery_state, campaign_id").eq("workspace_id", filters.workspaceId).gte("created_at", filters.from).lte("created_at", filters.to).limit(LIMIT);
  const meetingsQuery = admin.from("meetings").select("created_at, provider_confirmed").eq("workspace_id", filters.workspaceId).gte("created_at", filters.from).lte("created_at", filters.to).limit(LIMIT);
  const enrollmentsQuery = admin.from("campaign_enrollments").select("created_at, stop_reason, campaign_id").eq("workspace_id", filters.workspaceId).gte("created_at", filters.from).lte("created_at", filters.to).limit(LIMIT);
  const jobsQuery = admin.from("outreach_jobs").select("created_at, status, campaign_id").eq("workspace_id", filters.workspaceId).gte("created_at", filters.from).lte("created_at", filters.to).limit(LIMIT);
  const [prospects, messages, meetings, enrollments, jobs, suppressions, invoices, credits, subscriptions, activities] = await Promise.all([
    prospectsQuery,
    filters.campaignId ? messagesQuery.eq("campaign_id", filters.campaignId) : messagesQuery,
    meetingsQuery,
    filters.campaignId ? enrollmentsQuery.eq("campaign_id", filters.campaignId) : enrollmentsQuery,
    filters.campaignId ? jobsQuery.eq("campaign_id", filters.campaignId) : jobsQuery,
    admin.from("suppressions").select("created_at").eq("workspace_id", filters.workspaceId).gte("created_at", filters.from).lte("created_at", filters.to).limit(LIMIT),
    admin.from("invoices").select("created_at, status, amount_cents, currency").eq("workspace_id", filters.workspaceId).gte("created_at", filters.from).lte("created_at", filters.to),
    admin.from("credit_transactions").select("created_at, amount, reason").eq("workspace_id", filters.workspaceId).gte("created_at", filters.from).lte("created_at", filters.to).limit(LIMIT),
    admin.from("subscriptions").select("status, plan_id").eq("workspace_id", filters.workspaceId),
    admin.from("prospect_activities").select("prospect_id, created_at, activity_type").eq("workspace_id", filters.workspaceId).in("activity_type", ["email_response_received", "meeting_booked"]).gte("created_at", filters.from).lte("created_at", filters.to).limit(LIMIT),
  ]);
  const companyIds = [...new Set((prospects.data ?? []).map((row) => row.company_id).filter((id): id is string => Boolean(id)))];
  const { data: companies } = companyIds.length
    ? await admin.from("companies").select("id, industry").in("id", companyIds)
    : { data: [] };
  const industryByCompany = new Map((companies ?? []).map((company) => [company.id, company.industry]));
  const rows = (prospects.data ?? []).filter((row) => {
    if (prospectIds && !prospectIds.has(row.id)) return false;
    if (filters.ownerId && row.owner_user_id !== filters.ownerId) return false;
    if (filters.source && row.source !== filters.source) return false;
    if (filters.geography && row.location !== filters.geography) return false;
    if (filters.industry && industryByCompany.get(row.company_id) !== filters.industry) return false;
    return true;
  });
  const createdAt = new Map(rows.map((row) => [row.id, Date.parse(row.created_at)]));
  const engagementHours = (activities.data ?? []).flatMap((activity) => {
    const created = createdAt.get(activity.prospect_id);
    if (!created) return [];
    const hours = (Date.parse(activity.created_at) - created) / 3_600_000;
    return hours >= 0 ? [Math.round(hours * 10) / 10] : [];
  });
  const countOf = async (table: string) => {
    const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", filters.workspaceId).gte("created_at", filters.from).lte("created_at", filters.to);
    return count ?? 0;
  };
  const [aiRequests, enrichmentJobs, providerSearches, activityCount] = await Promise.all([
    countOf("ai_usage_log"),
    countOf("enrichment_jobs"),
    countOf("discovery_searches"),
    countOf("prospect_activities"),
  ]);
  const summary = computeAnalytics({
    prospects: rows.map((row) => ({
      createdAt: row.created_at,
      stage: row.stage,
      ownerId: row.owner_user_id,
      location: row.location,
      source: row.source,
      industry: row.company_id ? industryByCompany.get(row.company_id) ?? null : null,
      icpId: filters.icpId && prospectIds?.has(row.id) ? filters.icpId : null,
    })),
    meetings: (meetings.data ?? []).map((row) => ({ createdAt: row.created_at, providerConfirmed: row.provider_confirmed })),
    messages: (messages.data ?? []).map((row) => ({ createdAt: row.created_at, direction: row.direction, deliveryState: row.delivery_state, campaignId: row.campaign_id })),
    enrollments: (enrollments.data ?? []).map((row) => ({ createdAt: row.created_at, stopReason: row.stop_reason, campaignId: row.campaign_id })),
    jobs: (jobs.data ?? []).map((row) => ({ createdAt: row.created_at, status: row.status, campaignId: row.campaign_id })),
    suppressions: (suppressions.data ?? []).map((row) => ({ createdAt: row.created_at })),
    invoices: (invoices.data ?? []).map((row) => ({ createdAt: row.created_at, status: row.status, amountCents: row.amount_cents, currency: row.currency })),
    credits: (credits.data ?? []).map((row) => ({ createdAt: row.created_at, amount: row.amount, reason: row.reason })),
    subscriptions: await subscriptionPlans(admin, subscriptions.data ?? []),
    engagementHours,
    usage: { aiRequests, enrichmentJobs, providerSearches, activities: activityCount },
  });
  const truncated = [prospects.data, messages.data, meetings.data, enrollments.data, jobs.data, credits.data, activities.data].some((rows) => (rows?.length ?? 0) >= LIMIT);
  return { ...summary, truncated };
}

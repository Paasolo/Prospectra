import { z } from "zod";
import { ErrorCode } from "@prospectra/shared";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import { getClientEnv } from "@/lib/env";
import { postWorker } from "@/services/worker-client";

const bucket = z.array(z.object({ label: z.string(), count: z.number() }));

export const analyticsSchema = z.object({
  definitions: z.record(z.string()),
  prospects: z.object({
    discovered: z.number(),
    qualified: z.number(),
    contacted: z.number(),
    engaged: z.number(),
    meetingsBooked: z.number(),
    customersAcquired: z.number(),
  }),
  rates: z.object({ prospectConversion: z.number().nullable(), meetingRate: z.number().nullable() }),
  campaigns: z.object({
    enrolled: z.number(),
    attempted: z.number(),
    accepted: z.number(),
    delivered: z.number(),
    bounced: z.number(),
    replies: z.number(),
    positiveReplies: z.null(),
    unsubscribes: z.number(),
    complaints: z.number(),
    failures: z.number(),
  }),
  breakdowns: z.object({ industry: bucket, geography: bucket, source: bucket, owner: bucket, icp: bucket }),
  finance: z.object({
    revenueByCurrency: z.array(z.object({ currency: z.string(), amountCents: z.number() })),
    planDistribution: bucket,
    creditsConsumed: z.number(),
  }),
  creditSeries: z.array(z.object({ date: z.string(), consumed: z.number() })),
  sales: z.object({ timeToEngagementHours: z.number().nullable() }),
  usage: z.object({ aiRequests: z.number(), enrichmentJobs: z.number(), providerSearches: z.number(), activities: z.number() }).nullable(),
  truncated: z.boolean(),
  csv: z.string(),
});

export type AnalyticsResponse = z.infer<typeof analyticsSchema>;

export type AnalyticsQuery = {
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

export const analyticsService = {
  summary(query: AnalyticsQuery) {
    return postWorker("/v1/analytics/summary", query, analyticsSchema);
  },
  async pdf(query: AnalyticsQuery): Promise<Blob> {
    const env = getClientEnv();
    if (!env.workerUrl) throw new AppError(ErrorCode.PROVIDER_UNCONFIGURED, "Set VITE_WORKER_URL before downloading a report.");
    const init = getSupabaseInitResult();
    if (init.status === "unconfigured") throw new AppError(ErrorCode.PROVIDER_UNCONFIGURED, init.reason);
    const { data } = await init.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new AppError(ErrorCode.UNAUTHENTICATED, "Sign in to continue.");
    const response = await fetch(new URL("/v1/analytics/pdf", env.workerUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(query),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new AppError(ErrorCode.PROVIDER_ERROR, payload?.message ?? "The report could not be generated.");
    }
    return response.blob();
  },
};

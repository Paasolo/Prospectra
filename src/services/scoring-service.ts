import {
  analysisUsageSchema,
  DEFAULT_SCORING_WEIGHTS,
  scoreProspect,
  type IcpCriteria,
  type ScoringWeights,
  type ScoreSubject,
} from "@prospectra/shared";
import { ErrorCode } from "@prospectra/shared";
import { z } from "zod";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import type { Json } from "@/types/database";
import type { ProspectRow } from "@/services/prospect-service";
import { postWorker } from "@/services/worker-client";

const explainSchema = z.object({
  aiExplanation: z.string(),
  model: z.string(),
  usage: analysisUsageSchema,
});

function subjectFrom(prospect: ProspectRow): ScoreSubject {
  return {
    fullName: prospect.full_name,
    email: prospect.email,
    jobTitle: prospect.job_title,
    seniority: prospect.seniority,
    department: prospect.department,
    location: prospect.location,
    linkedinUrl: prospect.linkedin_url,
    companyName: prospect.companies?.name ?? null,
    companyWebsite: prospect.companies?.website_url ?? null,
    industry: prospect.companies?.industry ?? null,
    employeeCount: null,
    technologies: [],
    buyingSignals: [],
    businessModel: null,
  };
}

export const scoringService = {
  subjectFrom,

  async weights(workspaceId: string): Promise<ScoringWeights> {
    const { data, error } = await getSupabaseClient()
      .from("scoring_configs")
      .select("weights")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return { ...DEFAULT_SCORING_WEIGHTS, ...(data?.weights as Partial<ScoringWeights> | undefined) };
  },

  async saveWeights(workspaceId: string, weights: ScoringWeights, updatedBy: string | null) {
    const { error } = await getSupabaseClient().from("scoring_configs").upsert({
      workspace_id: workspaceId,
      weights,
      updated_by: updatedBy,
    });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async recalculate(input: { workspaceId: string; prospect: ProspectRow; icp: IcpCriteria | null; icpId: string | null }) {
    const weights = await this.weights(input.workspaceId);
    const result = scoreProspect({ subject: subjectFrom(input.prospect), icp: input.icp, weights });
    const { error } = await getSupabaseClient().from("prospect_scores").insert({
      workspace_id: input.workspaceId,
      prospect_id: input.prospect.id,
      icp_profile_id: input.icpId,
      scoring_version: result.scoringVersion,
      score: result.score,
      category: result.category,
      positive_factors: result.positiveFactors,
      negative_factors: result.negativeFactors,
      explanation: result.explanation,
      recommended_action: result.recommendedAction,
      inputs: result.inputs as unknown as Json,
    });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return result;
  },

  async latest(workspaceId: string, prospectId: string) {
    const { data, error } = await getSupabaseClient()
      .from("prospect_scores")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data;
  },

  async explain(input: {
    workspaceId: string;
    prospectId: string;
    score: number;
    category: string;
    explanation: string;
    factors: Array<{ dimension: string; detail: string }>;
  }) {
    const latest = await this.latest(input.workspaceId, input.prospectId);
    if (!latest) {
      throw new AppError(ErrorCode.NOT_FOUND, "Calculate a score before requesting an AI explanation.");
    }
    const explained = await postWorker("/v1/scoring/explain", input, explainSchema);
    const { error } = await getSupabaseClient()
      .from("prospect_scores")
      .update({ ai_explanation: explained.aiExplanation })
      .eq("id", latest.id)
      .eq("workspace_id", input.workspaceId);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return explained.aiExplanation;
  },
};

const enrichmentSchema = z.object({
  results: z.array(
    z.object({
      prospectId: z.string(),
      status: z.string(),
      errorCode: z.string().nullable(),
      errorDetail: z.string().nullable(),
      credits: z.number(),
      fields: z.array(z.record(z.unknown())),
    }),
  ),
  creditsConsumed: z.number(),
});

export const enrichmentService = {
  async run(workspaceId: string, prospectIds: string[]) {
    return postWorker("/v1/enrichment", { workspaceId, prospectIds }, enrichmentSchema);
  },

  async jobs(workspaceId: string) {
    const { data, error } = await getSupabaseClient()
      .from("enrichment_jobs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data ?? [];
  },

  async fields(workspaceId: string, prospectId: string) {
    const { data, error } = await getSupabaseClient()
      .from("enrichment_field_values")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("prospect_id", prospectId)
      .order("retrieved_at", { ascending: false });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data ?? [];
  },
};

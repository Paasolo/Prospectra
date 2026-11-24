import {
  analysisUsageSchema,
  assessIcpQuality,
  buildSearchFilters,
  emptyIcpCriteria,
  icpCriteriaSchema,
  icpRecommendationSchema,
  type IcpCriteria,
  type IcpQuality,
  type IcpRecommendation,
  type IcpSearchFilters,
} from "@prospectra/shared";
import { ErrorCode } from "@prospectra/shared";
import { z } from "zod";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import type { Database, Json } from "@/types/database";
import { postWorker } from "@/services/worker-client";

export type IcpRecord = Database["public"]["Tables"]["icp_profiles"]["Row"] & {
  criteria_parsed: IcpCriteria;
  filters_parsed: IcpSearchFilters;
  quality_parsed: IcpQuality;
  recommendation_parsed: IcpRecommendation | null;
};

const generationSchema = z.object({
  recommendation: icpRecommendationSchema,
  model: z.string(),
  usage: analysisUsageSchema,
});

function asRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapIcp(row: Database["public"]["Tables"]["icp_profiles"]["Row"]): IcpRecord {
  const criteria = icpCriteriaSchema.safeParse(row.criteria);
  const parsedCriteria = criteria.success ? criteria.data : emptyIcpCriteria();
  const quality = assessIcpQuality(parsedCriteria, row.description ?? "");
  const recommendation = icpRecommendationSchema.safeParse(row.recommendation);
  return {
    ...row,
    criteria_parsed: parsedCriteria,
    filters_parsed: buildSearchFilters(parsedCriteria),
    quality_parsed: quality,
    recommendation_parsed: recommendation.success ? recommendation.data : null,
  };
}

export const icpService = {
  empty: emptyIcpCriteria,
  assess: assessIcpQuality,
  filters: buildSearchFilters,

  async list(workspaceId: string): Promise<IcpRecord[]> {
    const { data, error } = await getSupabaseClient()
      .from("icp_profiles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return (data ?? []).map(mapIcp);
  },

  async get(workspaceId: string, id: string): Promise<IcpRecord> {
    const { data, error } = await getSupabaseClient()
      .from("icp_profiles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    if (!data) {
      throw new AppError(ErrorCode.NOT_FOUND, "ICP not found.");
    }
    return mapIcp(data);
  },

  async save(input: {
    workspaceId: string;
    id?: string;
    name: string;
    description: string;
    criteria: IcpCriteria;
    source: string;
    recommendation?: IcpRecommendation | null;
    duplicatedFrom?: string | null;
    createdBy?: string | null;
  }): Promise<string> {
    const quality = assessIcpQuality(input.criteria, input.description);
    const filters = buildSearchFilters(input.criteria);
    const payload = {
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description,
      criteria: input.criteria,
      source: input.source,
      recommendation: input.recommendation ?? {},
      search_filters: filters,
      quality,
      quality_score: quality.overall,
    };
    const client = getSupabaseClient();
    if (input.id) {
      const { error } = await client.from("icp_profiles").update(payload).eq("id", input.id).eq("workspace_id", input.workspaceId);
      if (error) {
        throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
      }
      return input.id;
    }
    const { data, error } = await client
      .from("icp_profiles")
      .insert({ ...payload, created_by: input.createdBy ?? null, duplicated_from: input.duplicatedFrom ?? null, status: "draft" })
      .select("id")
      .single();
    if (error || !data) {
      throw new AppError(ErrorCode.INTERNAL, error?.message ?? "Could not save the ICP.", { cause: error });
    }
    return data.id;
  },

  async setStatus(workspaceId: string, id: string, status: "draft" | "active" | "archived") {
    const patch =
      status === "active"
        ? { status, activated_at: new Date().toISOString(), archived_at: null }
        : status === "archived"
          ? { status, archived_at: new Date().toISOString() }
          : { status };
    const { error } = await getSupabaseClient().from("icp_profiles").update(patch).eq("id", id).eq("workspace_id", workspaceId);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async duplicate(workspaceId: string, id: string, createdBy: string | null) {
    const current = await this.get(workspaceId, id);
    return this.save({
      workspaceId,
      name: `Copy of ${current.name}`,
      description: current.description ?? "",
      criteria: current.criteria_parsed,
      source: current.source,
      recommendation: current.recommendation_parsed,
      duplicatedFrom: current.id,
      createdBy,
    });
  },

  async remove(workspaceId: string, id: string) {
    const { error } = await getSupabaseClient().from("icp_profiles").delete().eq("id", id).eq("workspace_id", workspaceId);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async generate(input: {
    workspaceId: string;
    source: "manual" | "website_analysis" | "existing_customers" | "successful_prospects" | "ai_discovery";
    description?: string;
    analysisId?: string;
  }) {
    const result = await postWorker("/v1/icp/generate", input, generationSchema);
    return {
      ...result,
      quality: assessIcpQuality(result.recommendation.criteria, result.recommendation.description),
      filters: buildSearchFilters(result.recommendation.criteria),
    };
  },

  readCriteria(value: Json): IcpCriteria {
    const parsed = icpCriteriaSchema.safeParse(asRecord(value));
    return parsed.success ? parsed.data : emptyIcpCriteria();
  },
};

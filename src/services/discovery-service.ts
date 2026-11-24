import {
  companySearchCriteriaSchema,
  contactSearchCriteriaSchema,
  type CompanySearchCriteria,
  type ContactSearchCriteria,
} from "@prospectra/shared";
import { ErrorCode } from "@prospectra/shared";
import { z } from "zod";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import { getWorker, postWorker } from "@/services/worker-client";

const providerSchema = z.object({
  providers: z.array(
    z.object({
      id: z.string(),
      role: z.string(),
      state: z.enum(["configured", "unconfigured", "misconfigured"]),
      detail: z.string(),
    }),
  ),
  openai: z.enum(["configured", "unconfigured"]),
});

const discoverySchema = z.object({
  searchId: z.string().uuid(),
  records: z.array(z.record(z.unknown())),
  creditsEstimated: z.number(),
  creditsConsumed: z.number(),
  duplicateCount: z.number(),
  notice: z.enum(["no_results", "partial_results"]).nullable(),
});

export const discoveryService = {
  async providerStatus(workspaceId: string) {
    return getWorker(`/v1/providers?workspaceId=${workspaceId}`, providerSchema);
  },

  async searchCompanies(input: {
    workspaceId: string;
    criteria: CompanySearchCriteria;
    page: number;
    pageSize: number;
    icpProfileId?: string;
  }) {
    return postWorker(
      "/v1/discovery/companies",
      { ...input, criteria: companySearchCriteriaSchema.parse(input.criteria) },
      discoverySchema,
    );
  },

  async searchContacts(input: {
    workspaceId: string;
    criteria: ContactSearchCriteria;
    page: number;
    pageSize: number;
    icpProfileId?: string;
  }) {
    return postWorker(
      "/v1/discovery/contacts",
      { ...input, criteria: contactSearchCriteriaSchema.parse(input.criteria) },
      discoverySchema,
    );
  },

  async listSearches(workspaceId: string, kind: "company" | "contact") {
    const { data, error } = await getSupabaseClient()
      .from("discovery_searches")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data ?? [];
  },

  async results(workspaceId: string, searchId: string) {
    const { data, error } = await getSupabaseClient()
      .from("discovery_search_results")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("search_id", searchId)
      .order("score", { ascending: false });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data ?? [];
  },
};

import {
  analysisReportMarkdown,
  analysisUsageSchema,
  annotateSourceReferences,
  normalizeDomain,
  parsePublicHttpUrl,
  websiteAnalysisOutputSchema,
  type WebsiteAnalysisOutput,
} from "@prospectra/shared";
import { z } from "zod";
import { ErrorCode } from "@prospectra/shared";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import type { Json } from "@/types/database";
import { postWorker } from "@/services/worker-client";

const responseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["succeeded", "failed"]),
  normalizedDomain: z.string().nullable(),
  extractedContent: z.record(z.unknown()),
  crawledUrls: z.array(z.record(z.unknown())),
  aiOutput: websiteAnalysisOutputSchema.nullable(),
  aiModel: z.string().nullable(),
  usage: analysisUsageSchema,
  errorCode: z.string().nullable(),
  errorDetail: z.string().nullable(),
  credits: z.number(),
});

export type AnalysisRecord = {
  id: string;
  workspace_id: string;
  submitted_url: string;
  normalized_domain: string | null;
  company_name: string | null;
  instructions: string | null;
  extracted_content: Json;
  crawled_urls: Json;
  ai_output: WebsiteAnalysisOutput | null;
  output_error: string | null;
  ai_model: string | null;
  usage: Json;
  estimated_cost_usd: number | null;
  status: string;
  error_code: string | null;
  error_detail: string | null;
  created_at: string;
};

function mapRow(row: {
  id: string;
  workspace_id: string;
  submitted_url: string;
  normalized_domain: string | null;
  company_name: string | null;
  instructions: string | null;
  extracted_content: Json;
  crawled_urls: Json;
  ai_output: Json | null;
  ai_model: string | null;
  usage: Json;
  estimated_cost_usd: number | null;
  status: string;
  error_code: string | null;
  error_detail: string | null;
  created_at: string;
}): AnalysisRecord {
  const parsed = websiteAnalysisOutputSchema.safeParse(row.ai_output);
  return {
    ...row,
    ai_output: parsed.success ? parsed.data : null,
    output_error: row.ai_output && !parsed.success ? "Stored AI output failed validation." : null,
  };
}

export const analysisService = {
  validateUrl(url: string) {
    return parsePublicHttpUrl(url);
  },

  async list(workspaceId: string): Promise<AnalysisRecord[]> {
    const { data, error } = await getSupabaseClient()
      .from("website_analyses")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return (data ?? []).map(mapRow);
  },

  async get(workspaceId: string, id: string): Promise<AnalysisRecord> {
    const { data, error } = await getSupabaseClient()
      .from("website_analyses")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    if (!data) {
      throw new AppError(ErrorCode.NOT_FOUND, "Analysis not found.");
    }
    return mapRow(data);
  },

  async start(input: { workspaceId: string; url: string; companyName?: string; instructions?: string }) {
    const decision = parsePublicHttpUrl(input.url);
    if (!decision.ok) {
      throw new AppError(decision.code === "SSRF_BLOCKED" ? ErrorCode.SSRF_BLOCKED : ErrorCode.VALIDATION_FAILED, decision.reason);
    }
    return postWorker("/v1/website-analyses", input, responseSchema);
  },

  report(record: AnalysisRecord): string {
    if (!record.ai_output) {
      return `Website analysis\n\nStatus: ${record.status}\nURL: ${record.submitted_url}\n${record.error_detail ?? "No AI report is stored."}`;
    }
    return analysisReportMarkdown({
      submittedUrl: record.submitted_url,
      companyName: record.company_name,
      output: record.ai_output,
      model: record.ai_model,
    });
  },

  annotated(record: AnalysisRecord) {
    if (!record.ai_output) {
      return null;
    }
    const urls = Array.isArray(record.crawled_urls)
      ? record.crawled_urls.flatMap((item) => {
          if (item && typeof item === "object" && "url" in item && typeof item.url === "string") {
            return [item.url];
          }
          return [];
        })
      : [];
    return annotateSourceReferences(record.ai_output, urls);
  },

  async saveCompany(workspaceId: string, record: AnalysisRecord) {
    const name = record.company_name || record.ai_output?.companyOverview.slice(0, 120) || record.normalized_domain;
    if (!name) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, "The analysis does not include a company name to save.");
    }
    const domain = record.normalized_domain ?? normalizeDomain(record.submitted_url);
    const client = getSupabaseClient();
    if (domain) {
      const { data: existing } = await client
        .from("companies")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("normalized_domain", domain)
        .maybeSingle();
      if (existing) {
        return existing.id;
      }
    }
    const { data, error } = await client
      .from("companies")
      .insert({
        workspace_id: workspaceId,
        name,
        domain,
        normalized_domain: domain,
        website_url: record.submitted_url,
        industry: record.ai_output?.industries[0] ?? null,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new AppError(ErrorCode.INTERNAL, error?.message ?? "Could not save the company.", { cause: error });
    }
    return data.id;
  },
};

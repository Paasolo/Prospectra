import {
  buildWebsiteAnalysisMessages,
  extractBusinessEvidence,
  websiteAnalysisJsonSchema,
  websiteAnalysisOutputSchema,
  type AnalysisUsage,
  type ExtractedEvidence,
  type WebsiteAnalysisOutput,
} from "@prospectra/shared";
import { AiOutputError, createStructuredCompletion } from "../ai/openai.js";
import { crawlWebsite, type CrawlDependencies, type CrawlRecord } from "../crawl/crawler.js";

export type AnalysisExecution = {
  status: "succeeded" | "failed";
  normalizedDomain: string | null;
  extractedContent: ExtractedEvidence;
  crawledUrls: CrawlRecord[];
  aiOutput: WebsiteAnalysisOutput | null;
  aiModel: string | null;
  usage: AnalysisUsage;
  errorCode: string | null;
  errorDetail: string | null;
};

const emptyUsage: AnalysisUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: null,
};

const emptyEvidence: ExtractedEvidence = {
  companyName: null,
  description: null,
  products: [],
  services: [],
  industry: null,
  targetMarkets: [],
  valueProposition: null,
  businessModel: null,
  customerSegments: [],
  contacts: { emails: [], phones: [] },
  keywords: [],
  excerpts: [],
};

export async function executeWebsiteAnalysis(
  input: {
    url: string;
    companyName?: string | null;
    instructions?: string | null;
    openaiApiKey?: string;
    openaiModel: string;
  },
  deps: CrawlDependencies & {
    complete?: typeof createStructuredCompletion;
  },
): Promise<AnalysisExecution> {
  const crawled = await crawlWebsite(input.url, deps);
  if (!crawled.ok) {
    return {
      status: "failed",
      normalizedDomain: null,
      extractedContent: emptyEvidence,
      crawledUrls: crawled.records,
      aiOutput: null,
      aiModel: null,
      usage: emptyUsage,
      errorCode: crawled.code,
      errorDetail: crawled.message,
    };
  }

  const extractedContent = extractBusinessEvidence(
    crawled.pages.map((page) => ({ url: page.url, html: page.html, title: page.title })),
  );

  if (!input.openaiApiKey) {
    return {
      status: "failed",
      normalizedDomain: crawled.normalizedDomain,
      extractedContent,
      crawledUrls: crawled.records,
      aiOutput: null,
      aiModel: null,
      usage: emptyUsage,
      errorCode: "PROVIDER_UNCONFIGURED",
      errorDetail: "OpenAI is not configured. Set OPENAI_API_KEY on the worker. The crawl was saved.",
    };
  }

  try {
    const completion = await (deps.complete ?? createStructuredCompletion)({
      apiKey: input.openaiApiKey,
      model: input.openaiModel,
      schemaName: "website_analysis",
      jsonSchema: websiteAnalysisJsonSchema,
      messages: buildWebsiteAnalysisMessages({
        companyName: input.companyName,
        instructions: input.instructions,
        evidence: extractedContent,
      }),
      parse: (value) => websiteAnalysisOutputSchema.parse(value),
    });
    return {
      status: "succeeded",
      normalizedDomain: crawled.normalizedDomain,
      extractedContent,
      crawledUrls: crawled.records,
      aiOutput: completion.data,
      aiModel: completion.model,
      usage: completion.usage,
      errorCode: null,
      errorDetail: null,
    };
  } catch (error) {
    const invalid = error instanceof AiOutputError;
    return {
      status: "failed",
      normalizedDomain: crawled.normalizedDomain,
      extractedContent,
      crawledUrls: crawled.records,
      aiOutput: null,
      aiModel: input.openaiModel,
      usage: emptyUsage,
      errorCode: invalid ? "AI_OUTPUT_INVALID" : "PROVIDER_ERROR",
      errorDetail: error instanceof Error ? error.message : "AI analysis failed.",
    };
  }
}

import { CREDIT_COSTS, enrichedFieldSchema, nextEnrichmentStatus, type EnrichedField } from "@prospectra/shared";
import type { EmailVerification } from "@prospectra/shared";
import { ProviderRequestError } from "../providers/errors.js";

export type EnrichmentProspect = {
  id: string;
  fullName: string | null;
  email: string | null;
  companyName: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
};

export type EnrichmentExecution = {
  prospectId: string;
  status: "succeeded" | "failed" | "dead_letter";
  attempts: number;
  fields: EnrichedField[];
  credits: number;
  errorCode: string | null;
  errorDetail: string | null;
};

export async function executeEnrichment(
  prospect: EnrichmentProspect,
  deps: {
    enrich: (prospect: EnrichmentProspect) => Promise<EnrichedField[]>;
    verifyEmail?: (email: string) => Promise<EmailVerification>;
    sleep?: (ms: number) => Promise<void>;
    maxAttempts?: number;
  },
): Promise<EnrichmentExecution> {
  const maxAttempts = deps.maxAttempts ?? 3;
  const sleep = deps.sleep ?? (async () => undefined);
  let attempts = 0;
  let lastError: ProviderRequestError | null = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      let fields = await deps.enrich(prospect);
      let verificationCredits = 0;
      const email = fields.find((field) => field.field === "businessEmail")?.value || prospect.email;
      if (email && deps.verifyEmail) {
        const verification = await deps.verifyEmail(email);
        verificationCredits = CREDIT_COSTS.emailVerification;
        fields = fields.map((field) =>
          field.field === "businessEmail" ? { ...field, verified: verification.verified } : field,
        );
        const verificationField = enrichedFieldSchema.parse({
          field: "emailVerification",
          value: verification.result,
          source: verification.source,
          verified: verification.verified,
          retrievedAt: new Date().toISOString(),
        });
        fields = [...fields.filter((field) => field.field !== "emailVerification"), verificationField];
      }

      const status = nextEnrichmentStatus({
        attempt: attempts,
        maxAttempts,
        result: { ok: true, fields, retryable: false },
      });
      return {
        prospectId: prospect.id,
        status: status === "succeeded" ? "succeeded" : "failed",
        attempts,
        fields,
        credits: fields.some((field) => field.source !== "hunter") ? CREDIT_COSTS.enrichmentPerProspect + verificationCredits : verificationCredits,
        errorCode: fields.length ? null : "no_results",
        errorDetail: fields.length ? null : "The enrichment provider returned no fields for this prospect.",
      };
    } catch (error) {
      lastError =
        error instanceof ProviderRequestError
          ? error
          : new ProviderRequestError("PROVIDER_ERROR", error instanceof Error ? error.message : "Enrichment failed.");
      const retryable = lastError.code === "timeout" || lastError.code === "rate_limited";
      const status = nextEnrichmentStatus({
        attempt: attempts,
        maxAttempts,
        result: { ok: false, fields: [], retryable, code: lastError.code, message: lastError.message },
      });
      if (status === "pending") {
        await sleep(200 * attempts);
        continue;
      }
      return {
        prospectId: prospect.id,
        status: status === "dead_letter" ? "dead_letter" : "failed",
        attempts,
        fields: [],
        credits: 0,
        errorCode: lastError.code,
        errorDetail: lastError.message,
      };
    }
  }

  return {
    prospectId: prospect.id,
    status: "dead_letter",
    attempts,
    fields: [],
    credits: 0,
    errorCode: lastError?.code ?? "JOB_FAILED",
    errorDetail: lastError?.message ?? "Enrichment retries were exhausted.",
  };
}

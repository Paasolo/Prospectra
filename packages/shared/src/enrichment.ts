import { z } from "zod";

export const ENRICHMENT_FIELDS = [
  "fullName",
  "jobTitle",
  "department",
  "seniority",
  "company",
  "companyWebsite",
  "businessEmail",
  "emailVerification",
  "professionalProfile",
  "location",
  "industry",
  "employeeCount",
  "revenueRange",
  "technologies",
] as const;

export type EnrichmentFieldName = (typeof ENRICHMENT_FIELDS)[number];

export const enrichedFieldSchema = z.object({
  field: z.enum(ENRICHMENT_FIELDS),
  value: z.string().min(1).max(2000),
  source: z.string().min(1).max(80),
  verified: z.boolean(),
  retrievedAt: z.string().datetime(),
});

export type EnrichedField = z.infer<typeof enrichedFieldSchema>;

export const emailVerificationSchema = z.object({
  result: z.enum(["deliverable", "undeliverable", "risky", "unknown"]),
  status: z.string().max(80),
  score: z.number().min(0).max(100).nullable(),
  source: z.string().min(1),
  verified: z.boolean(),
});

export type EmailVerification = z.infer<typeof emailVerificationSchema>;

export function verificationFromProvider(input: {
  result: string;
  status: string;
  score?: number | null;
  source: string;
}): EmailVerification {
  const result = ["deliverable", "undeliverable", "risky", "unknown"].includes(input.result)
    ? (input.result as EmailVerification["result"])
    : "unknown";
  return emailVerificationSchema.parse({
    result,
    status: input.status,
    score: input.score ?? null,
    source: input.source,
    verified: result === "deliverable",
  });
}

export type EnrichmentAttempt = {
  ok: boolean;
  fields: EnrichedField[];
  retryable: boolean;
  code?: string;
  message?: string;
};

export function nextEnrichmentStatus(input: {
  attempt: number;
  maxAttempts: number;
  result: EnrichmentAttempt;
}): "succeeded" | "failed" | "dead_letter" | "pending" {
  if (input.result.ok) {
    return "succeeded";
  }
  if (!input.result.retryable) {
    return "failed";
  }
  if (input.attempt >= input.maxAttempts) {
    return "dead_letter";
  }
  return "pending";
}

export function presentFields(
  entries: Array<{ field: EnrichmentFieldName; value: string | number | null | undefined; source: string; verified?: boolean; retrievedAt: string }>,
): EnrichedField[] {
  const fields: EnrichedField[] = [];
  for (const entry of entries) {
    if (entry.value === null || entry.value === undefined) {
      continue;
    }
    const value = String(entry.value).trim();
    if (!value) {
      continue;
    }
    const parsed = enrichedFieldSchema.safeParse({
      field: entry.field,
      value,
      source: entry.source,
      verified: entry.verified ?? false,
      retrievedAt: entry.retrievedAt,
    });
    if (parsed.success) {
      fields.push(parsed.data);
    }
  }
  return fields;
}

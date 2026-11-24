import { z } from "zod";
import type { IcpCriteria, IcpSearchFilters } from "./icp.js";
import { normalizeDomain } from "./ssrf.js";

export const CREDIT_COSTS = {
  websiteAnalysis: 5,
  companyDiscoveryPerResult: 1,
  contactDiscoveryPerResult: 2,
  enrichmentPerProspect: 3,
  companyEnrichment: 2,
  bulkOperationPerRecord: 1,
  emailVerification: 1,
  assistantMessage: 2,
  emailGeneration: 2,
  emailSend: 1,
  outboundAgentResearch: 5,
} as const;

export const companySearchCriteriaSchema = z.object({
  companyName: z.string().trim().max(200).default(""),
  industries: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  geographies: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  employeeMin: z.number().int().nonnegative().nullable().default(null),
  employeeMax: z.number().int().nonnegative().nullable().default(null),
  revenueMin: z.number().int().nonnegative().nullable().default(null),
  revenueMax: z.number().int().nonnegative().nullable().default(null),
  companyType: z.string().trim().max(80).default(""),
  website: z.string().trim().max(300).default(""),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  technologies: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  businessModel: z.string().trim().max(120).default(""),
  buyingSignals: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
});

export type CompanySearchCriteria = z.infer<typeof companySearchCriteriaSchema>;

export const contactSearchCriteriaSchema = z.object({
  companyName: z.string().trim().max(200).default(""),
  companyDomain: z.string().trim().max(200).default(""),
  jobTitles: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  departments: z.array(z.string().trim().min(1).max(80)).max(15).default([]),
  seniority: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  locations: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  professionalProfile: z.string().trim().max(300).default(""),
  requireEmail: z.boolean().default(false),
});

export type ContactSearchCriteria = z.infer<typeof contactSearchCriteriaSchema>;

export const PROVIDER_USAGE_RESTRICTION =
  "Subject to the provider's terms. This record is provider-supplied and is not independently verified by Prospectra.";

export type NormalizedCompany = {
  provider: string;
  providerRecordId: string;
  name: string;
  domain: string | null;
  websiteUrl: string | null;
  industry: string | null;
  employeeCount: number | null;
  location: string | null;
  keywords: string[];
  description: string | null;
  technologies: string[];
  retrievedAt: string;
  confidence: "provider_supplied_unverified";
  providerConfidence: number | null;
  usageRestrictions: string;
  alreadyInWorkspace: boolean;
};

export type NormalizedContact = {
  provider: string;
  providerRecordId: string;
  fullName: string | null;
  jobTitle: string | null;
  seniority: string | null;
  department: string | null;
  location: string | null;
  email: string | null;
  emailVerified: false;
  linkedinUrl: string | null;
  companyName: string | null;
  companyDomain: string | null;
  retrievedAt: string;
  confidence: "provider_supplied_unverified";
  providerConfidence: number | null;
  usageRestrictions: string;
  alreadyInWorkspace: boolean;
};

export type ProviderFailureCode =
  | "invalid_credentials"
  | "quota_exceeded"
  | "timeout"
  | "rate_limited"
  | "no_results"
  | "partial_results"
  | "invalid_response"
  | "unconfigured"
  | "misconfigured";

export function estimateDiscoveryCredits(kind: "company" | "contact", pageSize: number): number {
  const unit = kind === "company" ? CREDIT_COSTS.companyDiscoveryPerResult : CREDIT_COSTS.contactDiscoveryPerResult;
  return Math.max(0, pageSize) * unit;
}

export function companyDedupeKey(record: Pick<NormalizedCompany, "provider" | "providerRecordId" | "domain">): string {
  return record.domain ? `domain:${record.domain}` : `provider:${record.provider}:${record.providerRecordId}`;
}

export function contactDedupeKey(
  record: Pick<NormalizedContact, "provider" | "providerRecordId" | "email" | "linkedinUrl">,
): string {
  if (record.email) {
    return `email:${record.email.toLowerCase()}`;
  }
  if (record.linkedinUrl) {
    return `profile:${record.linkedinUrl.toLowerCase()}`;
  }
  return `provider:${record.provider}:${record.providerRecordId}`;
}

export function dedupeByKey<T>(records: T[], keyOf: (record: T) => string): { unique: T[]; duplicateCount: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicateCount = 0;
  for (const record of records) {
    const key = keyOf(record);
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    unique.push(record);
  }
  return { unique, duplicateCount };
}

export function criteriaFromIcp(filters: IcpSearchFilters): {
  company: CompanySearchCriteria;
  contact: ContactSearchCriteria;
} {
  return {
    company: companySearchCriteriaSchema.parse({
      industries: filters.industries,
      geographies: filters.geographies,
      employeeMin: filters.employeeMin,
      employeeMax: filters.employeeMax,
      revenueMin: filters.revenueMin,
      revenueMax: filters.revenueMax,
      technologies: filters.technologies,
      businessModel: filters.businessModel ?? "",
      keywords: filters.keywords,
    }),
    contact: contactSearchCriteriaSchema.parse({
      jobTitles: filters.jobTitles,
      departments: filters.departments,
      seniority: filters.seniority,
      locations: filters.geographies,
    }),
  };
}

export function validateCompanySearch(criteria: CompanySearchCriteria): string | null {
  if (
    criteria.employeeMin !== null &&
    criteria.employeeMax !== null &&
    criteria.employeeMin > criteria.employeeMax
  ) {
    return "Employee minimum cannot exceed employee maximum.";
  }
  const hasSignal = Boolean(
    criteria.companyName ||
      criteria.industries.length ||
      criteria.geographies.length ||
      criteria.keywords.length ||
      criteria.technologies.length ||
      criteria.website ||
      criteria.employeeMin !== null ||
      criteria.employeeMax !== null,
  );
  return hasSignal ? null : "Add at least one company search criterion.";
}

export function validateContactSearch(criteria: ContactSearchCriteria): string | null {
  const hasSignal = Boolean(
    criteria.companyName ||
      criteria.companyDomain ||
      criteria.jobTitles.length ||
      criteria.departments.length ||
      criteria.seniority.length ||
      criteria.locations.length ||
      criteria.professionalProfile,
  );
  return hasSignal ? null : "Add at least one contact search criterion.";
}

export function locationLabel(parts: Array<string | null | undefined>): string | null {
  const label = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
  return label || null;
}

export function cleanDomain(value: string | null | undefined): string | null {
  return normalizeDomain(value);
}

export type DiscoveryJobSuccess<T> = {
  ok: true;
  records: T[];
  creditsEstimated: number;
  creditsConsumed: number;
  duplicateCount: number;
  notice: "no_results" | "partial_results" | null;
};

export type DiscoveryJobFailure = {
  ok: false;
  code: string;
  message: string;
  creditsConsumed: 0;
};

type ProviderPage<T> = {
  records: T[];
  partial: boolean;
};

export async function runDiscoveryJob<T>(input: {
  kind: "company" | "contact";
  pageSize: number;
  balance: number;
  existingKeys: string[];
  keyOf: (record: T) => string;
  search: () => Promise<ProviderPage<T>>;
  markExisting: (record: T, existing: Set<string>) => T;
}): Promise<DiscoveryJobSuccess<T> | DiscoveryJobFailure> {
  const creditsEstimated = estimateDiscoveryCredits(input.kind, input.pageSize);
  if (input.balance < creditsEstimated) {
    return {
      ok: false,
      code: "CREDIT_INSUFFICIENT",
      message: `This search needs ${creditsEstimated} credits and the workspace has ${input.balance}.`,
      creditsConsumed: 0,
    };
  }

  let page: ProviderPage<T>;
  try {
    page = await input.search();
  } catch (error) {
    const coded = error as { code?: string; message?: string };
    return {
      ok: false,
      code: coded.code || "PROVIDER_ERROR",
      message: coded.message || "The discovery provider failed.",
      creditsConsumed: 0,
    };
  }

  const deduped = dedupeByKey(page.records, input.keyOf);
  const existing = new Set(input.existingKeys);
  const records = deduped.unique
    .slice(0, input.pageSize)
    .map((record) => input.markExisting(record, existing));
  const unit = input.kind === "company" ? CREDIT_COSTS.companyDiscoveryPerResult : CREDIT_COSTS.contactDiscoveryPerResult;

  return {
    ok: true,
    records,
    creditsEstimated,
    creditsConsumed: records.length * unit,
    duplicateCount: deduped.duplicateCount,
    notice: records.length === 0 ? "no_results" : page.partial ? "partial_results" : null,
  };
}

export function companyMatchesWorkspace(record: NormalizedCompany, existing: Set<string>): NormalizedCompany {
  const key = companyDedupeKey(record);
  return { ...record, alreadyInWorkspace: existing.has(key) || existing.has(record.providerRecordId) };
}

export function contactMatchesWorkspace(record: NormalizedContact, existing: Set<string>): NormalizedContact {
  const key = contactDedupeKey(record);
  return { ...record, alreadyInWorkspace: existing.has(key) };
}

export function icpCriteriaForScoring(criteria: IcpCriteria | null): IcpCriteria | null {
  return criteria;
}

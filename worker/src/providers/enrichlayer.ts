import {
  cleanDomain,
  locationLabel,
  PROVIDER_USAGE_RESTRICTION,
  presentFields,
  type CompanySearchCriteria,
  type ContactSearchCriteria,
  type EnrichedField,
  type NormalizedCompany,
  type NormalizedContact,
} from "@prospectra/shared";
import { z } from "zod";
import { ProviderRequestError, providerErrorFromStatus, providerErrorFromUnknown } from "./errors.js";

const ENRICHLAYER_BASE = "https://enrichlayer.com";

const personProfileSchema = z
  .object({
    public_identifier: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    full_name: z.string().nullable().optional(),
    occupation: z.string().nullable().optional(),
    headline: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    experiences: z
      .array(
        z
          .object({
            company: z.string().nullable().optional(),
            company_linkedin_profile_url: z.string().nullable().optional(),
            title: z.string().nullable().optional(),
            ends_at: z.unknown().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    personal_emails: z.array(z.string()).nullable().optional(),
    work_email: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  })
  .passthrough();

const companyProfileSchema = z
  .object({
    name: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    company_size: z.union([z.number(), z.string()]).nullable().optional(),
    company_size_on_linkedin: z.number().nullable().optional(),
    description: z.string().nullable().optional(),
    specialities: z.array(z.string()).nullable().optional(),
    hq: z
      .object({
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    linkedin_profile_url: z.string().nullable().optional(),
  })
  .passthrough();

const personResultSchema = z
  .object({
    linkedin_profile_url: z.string().nullable().optional(),
    profile: personProfileSchema.nullable().optional(),
  })
  .passthrough();

const companyResultSchema = z
  .object({
    linkedin_profile_url: z.string().nullable().optional(),
    profile: companyProfileSchema.nullable().optional(),
  })
  .passthrough();

function booleanOr(values: string[], max = 255): string | undefined {
  const joined = values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (/\s/.test(value) ? `"${value.replace(/"/g, "")}"` : value))
    .join(" OR ");
  if (!joined) return undefined;
  return joined.slice(0, max);
}

function parseGeography(values: string[]): { country?: string; region?: string; city?: string } {
  const first = values.map((value) => value.trim()).find(Boolean);
  if (!first) return {};
  if (/^[A-Za-z]{2}$/.test(first)) {
    return { country: first.toUpperCase() };
  }
  return { region: first.slice(0, 120) };
}

function employeeCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/\d+/);
    if (match) return Number.parseInt(match[0], 10);
  }
  return null;
}

function currentExperience(profile: z.infer<typeof personProfileSchema>) {
  const experiences = profile.experiences ?? [];
  return experiences.find((item) => item.ends_at == null) ?? experiences[0] ?? null;
}

function personEmail(profile: z.infer<typeof personProfileSchema>): string | null {
  return profile.work_email?.trim() || profile.email?.trim() || profile.personal_emails?.[0]?.trim() || null;
}

function recordId(...parts: Array<string | null | undefined>): string {
  const joined = parts.map((part) => part?.trim()).filter(Boolean).join("|");
  return joined || crypto.randomUUID();
}

export function buildEnrichLayerCompanyQuery(
  criteria: CompanySearchCriteria,
  pageSize: number,
): Record<string, string> {
  const geo = parseGeography(criteria.geographies);
  const query: Record<string, string> = {
    page_size: String(Math.min(Math.max(pageSize, 1), 10)),
    enrich_profiles: "enrich",
  };
  if (criteria.companyName) query.name = criteria.companyName.slice(0, 255);
  if (criteria.industries[0]) query.industry = booleanOr(criteria.industries) ?? criteria.industries[0];
  if (geo.country) query.country = geo.country;
  if (geo.region) query.region = geo.region;
  if (geo.city) query.city = geo.city;
  if (criteria.employeeMin !== null) query.employee_count_min = String(criteria.employeeMin);
  if (criteria.employeeMax !== null) query.employee_count_max = String(criteria.employeeMax);
  const description = booleanOr([...criteria.keywords, ...criteria.technologies, criteria.businessModel].filter(Boolean));
  if (description) query.description = description;
  return query;
}

export function buildEnrichLayerContactQuery(
  criteria: ContactSearchCriteria,
  pageSize: number,
): Record<string, string> {
  const geo = parseGeography(criteria.locations);
  const titles = [...criteria.jobTitles, criteria.professionalProfile].filter(Boolean);
  const query: Record<string, string> = {
    page_size: String(Math.min(Math.max(pageSize, 1), 10)),
    enrich_profiles: "enrich",
  };
  const role = booleanOr(titles);
  if (role) query.current_role_title = role;
  if (criteria.companyName) query.current_company_name = criteria.companyName.slice(0, 255);
  if (criteria.companyDomain) {
    const domain = cleanDomain(criteria.companyDomain);
    if (domain) query.current_company_domain_name = domain;
  }
  if (geo.country) query.country = geo.country;
  if (geo.region) query.region = geo.region;
  if (geo.city) query.city = geo.city;
  return query;
}

export function normalizeEnrichLayerCompanies(
  payload: unknown,
  retrievedAt: string,
): { records: NormalizedCompany[]; partial: boolean } {
  const body = z
    .object({
      results: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .safeParse(payload);
  if (!body.success) {
    throw new ProviderRequestError("invalid_response", "EnrichLayer company search returned an unexpected payload.");
  }
  return normalizeRows(body.data.results ?? [], companyResultSchema, (row) => {
    const profile = row.profile;
    const name = profile?.name?.trim();
    if (!name) return null;
    const linkedinUrl = row.linkedin_profile_url ?? profile?.linkedin_profile_url ?? null;
    const domain = cleanDomain(profile?.domain || profile?.website);
    return {
      provider: "enrichlayer",
      providerRecordId: recordId(linkedinUrl, name, domain),
      name,
      domain,
      websiteUrl: profile?.website ?? (domain ? `https://${domain}` : null),
      industry: profile?.industry ?? null,
      employeeCount: employeeCount(profile?.company_size_on_linkedin ?? profile?.company_size),
      location: locationLabel([profile?.hq?.city, profile?.hq?.state, profile?.hq?.country]),
      keywords: profile?.specialities ?? [],
      description: profile?.description ?? null,
      technologies: [],
      retrievedAt,
      confidence: "provider_supplied_unverified",
      providerConfidence: null,
      usageRestrictions: PROVIDER_USAGE_RESTRICTION,
      alreadyInWorkspace: false,
    };
  });
}

export function normalizeEnrichLayerContacts(
  payload: unknown,
  retrievedAt: string,
): { records: NormalizedContact[]; partial: boolean } {
  const body = z
    .object({
      results: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .safeParse(payload);
  if (!body.success) {
    throw new ProviderRequestError("invalid_response", "EnrichLayer contact search returned an unexpected payload.");
  }
  return normalizeRows(body.data.results ?? [], personResultSchema, (row) => {
    const profile = row.profile;
    const linkedinUrl = row.linkedin_profile_url ?? null;
    if (!profile && !linkedinUrl) return null;
    const experience = profile ? currentExperience(profile) : null;
    const fullName =
      profile?.full_name?.trim() ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
      null;
    return {
      provider: "enrichlayer",
      providerRecordId: recordId(linkedinUrl, profile?.public_identifier, fullName),
      fullName,
      jobTitle: experience?.title ?? profile?.occupation ?? profile?.headline ?? null,
      seniority: null,
      department: null,
      location: locationLabel([profile?.city, profile?.state, profile?.country]),
      email: profile ? personEmail(profile) : null,
      emailVerified: false,
      linkedinUrl,
      companyName: experience?.company ?? null,
      companyDomain: null,
      retrievedAt,
      confidence: "provider_supplied_unverified",
      providerConfidence: null,
      usageRestrictions: PROVIDER_USAGE_RESTRICTION,
      alreadyInWorkspace: false,
    };
  });
}

export function enrichLayerPersonToFields(payload: unknown, retrievedAt: string): EnrichedField[] {
  const body = personProfileSchema.safeParse(payload);
  if (!body.success) {
    const wrapped = z.object({ profile: personProfileSchema.nullable().optional() }).passthrough().safeParse(payload);
    if (!wrapped.success || !wrapped.data.profile) {
      throw new ProviderRequestError("invalid_response", "EnrichLayer enrichment returned an unexpected payload.");
    }
    return fieldsFromPerson(wrapped.data.profile, retrievedAt);
  }
  return fieldsFromPerson(body.data, retrievedAt);
}

function fieldsFromPerson(person: z.infer<typeof personProfileSchema>, retrievedAt: string): EnrichedField[] {
  const experience = currentExperience(person);
  const name =
    person.full_name?.trim() || [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || null;
  const linkedin =
    person.public_identifier != null ? `https://www.linkedin.com/in/${person.public_identifier}` : null;
  return presentFields([
    { field: "fullName", value: name, source: "enrichlayer", retrievedAt },
    { field: "jobTitle", value: experience?.title ?? person.occupation, source: "enrichlayer", retrievedAt },
    { field: "company", value: experience?.company, source: "enrichlayer", retrievedAt },
    { field: "businessEmail", value: personEmail(person), source: "enrichlayer", retrievedAt, verified: false },
    { field: "professionalProfile", value: linkedin, source: "enrichlayer", retrievedAt },
    { field: "location", value: locationLabel([person.city, person.state, person.country]), source: "enrichlayer", retrievedAt },
  ]);
}

function normalizeRows<TSchema extends z.ZodTypeAny, TRecord>(
  rows: unknown[],
  schema: TSchema,
  map: (value: z.infer<TSchema>) => TRecord | null,
): { records: TRecord[]; partial: boolean } {
  const records: TRecord[] = [];
  let dropped = 0;
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    const record = map(parsed.data);
    if (!record) {
      dropped += 1;
      continue;
    }
    records.push(record);
  }
  if (rows.length > 0 && records.length === 0) {
    throw new ProviderRequestError("invalid_response", "The provider payload did not contain usable records.");
  }
  return { records, partial: dropped > 0 };
}

export function createEnrichLayerClient(apiKey: string, fetchImpl: typeof fetch = fetch) {
  async function getJson<T>(path: string, query: Record<string, string>, map: (payload: unknown) => T): Promise<T> {
    try {
      const url = new URL(path, ENRICHLAYER_BASE);
      for (const [key, value] of Object.entries(query)) {
        if (value) url.searchParams.set(key, value);
      }
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, text);
      }
      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        throw new ProviderRequestError("invalid_response", "EnrichLayer returned invalid JSON.");
      }
      return map(json);
    } catch (error) {
      throw providerErrorFromUnknown(error);
    }
  }

  return {
    searchCompanies(criteria: CompanySearchCriteria, _page: number, pageSize: number, retrievedAt: string) {
      return getJson("/api/v2/search/company", buildEnrichLayerCompanyQuery(criteria, pageSize), (payload) =>
        normalizeEnrichLayerCompanies(payload, retrievedAt),
      );
    },
    searchContacts(criteria: ContactSearchCriteria, _page: number, pageSize: number, retrievedAt: string) {
      return getJson("/api/v2/search/person", buildEnrichLayerContactQuery(criteria, pageSize), (payload) =>
        normalizeEnrichLayerContacts(payload, retrievedAt),
      );
    },
    enrichPerson(body: Record<string, string | undefined>, retrievedAt: string) {
      const linkedinUrl = body.linkedin_url?.trim();
      const email = body.email?.trim();
      if (!linkedinUrl && !email) {
        return Promise.resolve([] as EnrichedField[]);
      }
      const query: Record<string, string> = {};
      if (linkedinUrl) query.linkedin_profile_url = linkedinUrl;
      if (email) query.email = email;
      return getJson("/api/v2/profile", query, (payload) => enrichLayerPersonToFields(payload, retrievedAt));
    },
  };
}

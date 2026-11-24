import {
  cleanDomain,
  locationLabel,
  PROVIDER_USAGE_RESTRICTION,
  type CompanySearchCriteria,
  type ContactSearchCriteria,
  type NormalizedCompany,
  type NormalizedContact,
} from "@prospectra/shared";
import { z } from "zod";
import { presentFields, type EnrichedField } from "@prospectra/shared";
import { ProviderRequestError, providerErrorFromStatus, providerErrorFromUnknown } from "./errors.js";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

const organizationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullable().optional(),
    website_url: z.string().nullable().optional(),
    primary_domain: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    estimated_num_employees: z.number().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    short_description: z.string().nullable().optional(),
    keywords: z.array(z.string()).nullable().optional(),
  })
  .passthrough();

const personSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    seniority: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    linkedin_url: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    departments: z.array(z.string()).nullable().optional(),
    organization: organizationSchema.partial({ id: true }).nullable().optional(),
  })
  .passthrough();

const SENIORITY: Record<string, string> = {
  "c-level": "c_suite",
  "c-suite": "c_suite",
  cxo: "c_suite",
  vp: "vp",
  "vice president": "vp",
  director: "director",
  manager: "manager",
  senior: "senior",
  head: "head",
  founder: "founder",
  owner: "owner",
  partner: "partner",
  entry: "entry",
  intern: "intern",
};

export function buildApolloCompanyBody(criteria: CompanySearchCriteria, page: number, pageSize: number) {
  const employeeRange =
    criteria.employeeMin !== null || criteria.employeeMax !== null
      ? [`${criteria.employeeMin ?? 1},${criteria.employeeMax ?? 1000000}`]
      : undefined;
  return {
    q_organization_name: criteria.companyName || undefined,
    organization_locations: criteria.geographies.length ? criteria.geographies : undefined,
    organization_num_employees_ranges: employeeRange,
    q_organization_keyword_tags: [...criteria.keywords, ...criteria.technologies, ...criteria.industries].filter(Boolean),
    q_organization_domains_list: criteria.website ? [cleanDomain(criteria.website)].filter(Boolean) : undefined,
    page,
    per_page: pageSize,
  };
}

export function buildApolloContactBody(criteria: ContactSearchCriteria, page: number, pageSize: number) {
  const seniorities = criteria.seniority
    .map((value) => SENIORITY[value.trim().toLowerCase()])
    .filter((value): value is string => Boolean(value));
  return {
    q_organization_name: criteria.companyName || undefined,
    q_organization_domains_list: criteria.companyDomain ? [cleanDomain(criteria.companyDomain)].filter(Boolean) : undefined,
    person_titles: [...criteria.jobTitles, criteria.professionalProfile].filter(Boolean),
    person_seniorities: seniorities.length ? seniorities : undefined,
    person_locations: criteria.locations.length ? criteria.locations : undefined,
    page,
    per_page: pageSize,
  };
}

export function normalizeApolloCompanies(
  payload: unknown,
  retrievedAt: string,
): { records: NormalizedCompany[]; partial: boolean } {
  const body = z
    .object({
      organizations: z.array(z.unknown()).optional(),
      accounts: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .safeParse(payload);
  if (!body.success) {
    throw new ProviderRequestError("invalid_response", "Apollo company search returned an unexpected payload.");
  }
  const rows = body.data.organizations ?? body.data.accounts ?? [];
  return normalizeRows(rows, organizationSchema, (organization) => {
    const name = organization.name?.trim();
    if (!name) {
      return null;
    }
    const domain = cleanDomain(organization.primary_domain || organization.website_url);
    return {
      provider: "apollo",
      providerRecordId: organization.id,
      name,
      domain,
      websiteUrl: organization.website_url ?? (domain ? `https://${domain}` : null),
      industry: organization.industry ?? null,
      employeeCount: organization.estimated_num_employees ?? null,
      location: locationLabel([organization.city, organization.state, organization.country]),
      keywords: organization.keywords ?? [],
      description: organization.short_description ?? null,
      technologies: [],
      retrievedAt,
      confidence: "provider_supplied_unverified",
      providerConfidence: null,
      usageRestrictions: PROVIDER_USAGE_RESTRICTION,
      alreadyInWorkspace: false,
    };
  });
}

export function normalizeApolloContacts(
  payload: unknown,
  retrievedAt: string,
): { records: NormalizedContact[]; partial: boolean } {
  const body = z
    .object({
      people: z.array(z.unknown()).optional(),
      contacts: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .safeParse(payload);
  if (!body.success) {
    throw new ProviderRequestError("invalid_response", "Apollo contact search returned an unexpected payload.");
  }
  return normalizeRows(body.data.people ?? body.data.contacts ?? [], personSchema, (person) => {
    const name = person.name?.trim() || [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
    return {
      provider: "apollo",
      providerRecordId: person.id,
      fullName: name || null,
      jobTitle: person.title ?? null,
      seniority: person.seniority ?? null,
      department: person.departments?.[0] ?? null,
      location: locationLabel([person.city, person.state, person.country]),
      email: person.email?.trim() || null,
      emailVerified: false,
      linkedinUrl: person.linkedin_url ?? null,
      companyName: person.organization?.name ?? null,
      companyDomain: cleanDomain(person.organization?.primary_domain || person.organization?.website_url),
      retrievedAt,
      confidence: "provider_supplied_unverified",
      providerConfidence: null,
      usageRestrictions: PROVIDER_USAGE_RESTRICTION,
      alreadyInWorkspace: false,
    };
  });
}

export function apolloPersonToFields(payload: unknown, retrievedAt: string): EnrichedField[] {
  const body = z.object({ person: personSchema.nullable().optional() }).passthrough().safeParse(payload);
  if (!body.success) {
    throw new ProviderRequestError("invalid_response", "Apollo enrichment returned an unexpected payload.");
  }
  const person = body.data.person;
  if (!person) {
    return [];
  }
  const name = person.name?.trim() || [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  return presentFields([
    { field: "fullName", value: name, source: "apollo", retrievedAt },
    { field: "jobTitle", value: person.title, source: "apollo", retrievedAt },
    { field: "department", value: person.departments?.[0], source: "apollo", retrievedAt },
    { field: "seniority", value: person.seniority, source: "apollo", retrievedAt },
    { field: "company", value: person.organization?.name, source: "apollo", retrievedAt },
    { field: "companyWebsite", value: person.organization?.website_url || person.organization?.primary_domain, source: "apollo", retrievedAt },
    { field: "businessEmail", value: person.email, source: "apollo", retrievedAt, verified: false },
    { field: "professionalProfile", value: person.linkedin_url, source: "apollo", retrievedAt },
    { field: "location", value: locationLabel([person.city, person.state, person.country]), source: "apollo", retrievedAt },
    { field: "industry", value: person.organization?.industry, source: "apollo", retrievedAt },
    { field: "employeeCount", value: person.organization?.estimated_num_employees, source: "apollo", retrievedAt },
    { field: "technologies", value: person.organization?.keywords?.join(", "), source: "apollo", retrievedAt },
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

export function createApolloClient(apiKey: string, fetchImpl: typeof fetch = fetch) {
  async function post<T>(path: string, body: unknown, map: (payload: unknown) => T): Promise<T> {
    try {
      const response = await fetchImpl(`${APOLLO_BASE}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, text);
      }
      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        throw new ProviderRequestError("invalid_response", "Apollo returned invalid JSON.");
      }
      return map(json);
    } catch (error) {
      throw providerErrorFromUnknown(error);
    }
  }

  return {
    searchCompanies(criteria: CompanySearchCriteria, page: number, pageSize: number, retrievedAt: string) {
      return post("/mixed_companies/search", buildApolloCompanyBody(criteria, page, pageSize), (payload) =>
        normalizeApolloCompanies(payload, retrievedAt),
      );
    },
    searchContacts(criteria: ContactSearchCriteria, page: number, pageSize: number, retrievedAt: string) {
      return post("/mixed_people/search", buildApolloContactBody(criteria, page, pageSize), (payload) =>
        normalizeApolloContacts(payload, retrievedAt),
      );
    },
    enrichPerson(body: Record<string, string | undefined>, retrievedAt: string) {
      return post("/people/match", body, (payload) => apolloPersonToFields(payload, retrievedAt));
    },
  };
}

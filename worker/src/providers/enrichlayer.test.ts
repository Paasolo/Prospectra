import { describe, expect, it, vi } from "vitest";
import {
  createEnrichLayerClient,
  normalizeEnrichLayerCompanies,
  normalizeEnrichLayerContacts,
} from "./enrichlayer.js";
import { ProviderRequestError } from "./errors.js";

const retrievedAt = "2026-11-24T00:00:00.000Z";

describe("EnrichLayer adapter", () => {
  it("normalizes company and contact payloads without inventing emails", () => {
    const companies = normalizeEnrichLayerCompanies(
      {
        results: [
          {
            linkedin_profile_url: "https://www.linkedin.com/company/analytical",
            profile: {
              name: "Analytical Engines",
              website: "https://analytical.example",
              industry: "Software",
              company_size_on_linkedin: 80,
              hq: { city: "London", country: "GB" },
            },
          },
          { linkedin_profile_url: "https://www.linkedin.com/company/empty" },
        ],
      },
      retrievedAt,
    );
    expect(companies.partial).toBe(true);
    expect(companies.records[0]).toMatchObject({
      provider: "enrichlayer",
      domain: "analytical.example",
      confidence: "provider_supplied_unverified",
    });

    const contacts = normalizeEnrichLayerContacts(
      {
        results: [
          {
            linkedin_profile_url: "https://www.linkedin.com/in/ada",
            profile: {
              public_identifier: "ada",
              first_name: "Ada",
              last_name: "Lovelace",
              occupation: "VP Operations",
              experiences: [{ company: "Analytical Engines", title: "VP Operations", ends_at: null }],
            },
          },
        ],
      },
      retrievedAt,
    );
    expect(contacts.records[0]).toMatchObject({
      fullName: "Ada Lovelace",
      email: null,
      emailVerified: false,
      linkedinUrl: "https://www.linkedin.com/in/ada",
      provider: "enrichlayer",
    });
  });

  it("maps credential, rate-limit, timeout, and invalid responses", async () => {
    const emptyCriteria = {
      companyName: "Ada",
      industries: [],
      geographies: [],
      employeeMin: null,
      employeeMax: null,
      revenueMin: null,
      revenueMax: null,
      companyType: "",
      website: "",
      keywords: [],
      technologies: [],
      businessModel: "",
      buyingSignals: [],
    };
    const contactCriteria = {
      companyName: "",
      companyDomain: "analytical.example",
      jobTitles: ["VP"],
      departments: [],
      seniority: [],
      locations: [],
      professionalProfile: "",
      requireEmail: false,
    };

    const client = createEnrichLayerClient("key", vi.fn(async () => new Response("no", { status: 401 })) as typeof fetch);
    await expect(client.searchCompanies(emptyCriteria, 1, 5, retrievedAt)).rejects.toMatchObject({
      code: "invalid_credentials",
    });

    const limited = createEnrichLayerClient(
      "key",
      vi.fn(async () => new Response("slow", { status: 429 })) as typeof fetch,
    );
    await expect(limited.searchCompanies(emptyCriteria, 1, 5, retrievedAt)).rejects.toMatchObject({
      code: "rate_limited",
    });

    const invalid = createEnrichLayerClient(
      "key",
      vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch,
    );
    await expect(invalid.searchContacts(contactCriteria, 1, 5, retrievedAt)).rejects.toBeInstanceOf(
      ProviderRequestError,
    );

    const timeout = createEnrichLayerClient(
      "key",
      vi.fn(async () => {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      }) as typeof fetch,
    );
    await expect(timeout.enrichPerson({ linkedin_url: "https://www.linkedin.com/in/ada" }, retrievedAt)).rejects.toMatchObject({
      code: "timeout",
    });
  });
});

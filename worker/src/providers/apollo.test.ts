import { describe, expect, it, vi } from "vitest";
import { createApolloClient, normalizeApolloCompanies, normalizeApolloContacts } from "./apollo.js";
import { ProviderRequestError } from "./errors.js";

const retrievedAt = "2026-11-24T00:00:00.000Z";

describe("Apollo adapter", () => {
  it("normalizes company and contact payloads without adding missing fields", () => {
    const companies = normalizeApolloCompanies(
      {
        organizations: [
          {
            id: "org_1",
            name: "Analytical Engines",
            primary_domain: "analytical.example",
            industry: "Software",
            estimated_num_employees: 80,
            city: "London",
            country: "United Kingdom",
          },
          { id: "org_2" },
        ],
      },
      retrievedAt,
    );
    expect(companies.partial).toBe(true);
    expect(companies.records[0]).toMatchObject({
      provider: "apollo",
      providerRecordId: "org_1",
      domain: "analytical.example",
      confidence: "provider_supplied_unverified",
    });

    const contacts = normalizeApolloContacts(
      { people: [{ id: "per_1", first_name: "Ada", last_name: "Lovelace", title: "VP Operations" }] },
      retrievedAt,
    );
    expect(contacts.records[0]).toMatchObject({
      fullName: "Ada Lovelace",
      email: null,
      emailVerified: false,
    });
  });

  it("maps credential, rate-limit, timeout, and invalid responses", async () => {
    const client = createApolloClient("key", vi.fn(async () => new Response("no", { status: 401 })) as typeof fetch);
    await expect(client.searchCompanies({ companyName: "Ada", industries: [], geographies: [], employeeMin: null, employeeMax: null, revenueMin: null, revenueMax: null, companyType: "", website: "", keywords: [], technologies: [], businessModel: "", buyingSignals: [] }, 1, 5, retrievedAt)).rejects.toMatchObject({ code: "invalid_credentials" });

    const limited = createApolloClient("key", vi.fn(async () => new Response("slow", { status: 429 })) as typeof fetch);
    await expect(limited.searchCompanies({ companyName: "Ada", industries: [], geographies: [], employeeMin: null, employeeMax: null, revenueMin: null, revenueMax: null, companyType: "", website: "", keywords: [], technologies: [], businessModel: "", buyingSignals: [] }, 1, 5, retrievedAt)).rejects.toMatchObject({ code: "rate_limited" });

    const invalid = createApolloClient("key", vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch);
    await expect(invalid.searchContacts({ companyName: "", companyDomain: "analytical.example", jobTitles: ["VP"], departments: [], seniority: [], locations: [], professionalProfile: "", requireEmail: false }, 1, 5, retrievedAt)).rejects.toBeInstanceOf(ProviderRequestError);

    const timeout = createApolloClient(
      "key",
      vi.fn(async () => {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      }) as typeof fetch,
    );
    await expect(timeout.enrichPerson({ email: "ada@analytical.example" }, retrievedAt)).rejects.toMatchObject({ code: "timeout" });
  });
});

import { describe, expect, it, vi } from "vitest";
import { dedupeByKey, estimateDiscoveryCredits, runDiscoveryJob, validateCompanySearch } from "./discovery.js";

describe("discovery jobs", () => {
  it("estimates credits and rejects a search before the provider is called when credits are short", async () => {
    const search = vi.fn();
    const result = await runDiscoveryJob({
      kind: "company",
      pageSize: 10,
      balance: 3,
      existingKeys: [],
      keyOf: (record: { domain: string }) => record.domain,
      search,
      markExisting: (record) => record,
    });

    expect(estimateDiscoveryCredits("company", 10)).toBe(10);
    expect(search).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: "CREDIT_INSUFFICIENT", creditsConsumed: 0 });
  });

  it("dedupes provider records, charges only kept rows, and surfaces provider failures", async () => {
    const success = await runDiscoveryJob({
      kind: "contact",
      pageSize: 5,
      balance: 20,
      existingKeys: ["email:ada@example.com"],
      keyOf: (record: { email: string }) => `email:${record.email}`,
      search: async () => ({
        records: [{ email: "ada@example.com" }, { email: "ada@example.com" }, { email: "grace@example.com" }],
        partial: true,
      }),
      markExisting: (record, existing) => ({ ...record, alreadyInWorkspace: existing.has(`email:${record.email}`) }),
    });

    expect(success).toMatchObject({
      ok: true,
      creditsConsumed: 4,
      duplicateCount: 1,
      notice: "partial_results",
    });
    if (success.ok) {
      expect(success.records).toEqual([
        { email: "ada@example.com", alreadyInWorkspace: true },
        { email: "grace@example.com", alreadyInWorkspace: false },
      ]);
    }

    const failed = await runDiscoveryJob({
      kind: "company",
      pageSize: 1,
      balance: 5,
      existingKeys: [],
      keyOf: () => "x",
      search: async () => {
        throw Object.assign(new Error("Too many requests"), { code: "rate_limited" });
      },
      markExisting: (record: { id: string }) => record,
    });
    expect(failed).toMatchObject({ ok: false, code: "rate_limited", creditsConsumed: 0 });
    expect(validateCompanySearch({ companyName: "", industries: [], geographies: [], employeeMin: null, employeeMax: null, revenueMin: null, revenueMax: null, companyType: "", website: "", keywords: [], technologies: [], businessModel: "", buyingSignals: [] })).toMatch(/criterion/);
  });

  it("collapses duplicate keys", () => {
    expect(dedupeByKey([{ id: "a" }, { id: "a" }, { id: "b" }], (record) => record.id)).toEqual({
      unique: [{ id: "a" }, { id: "b" }],
      duplicateCount: 1,
    });
  });
});

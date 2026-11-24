import { describe, expect, it, vi } from "vitest";
import { executeEnrichment } from "./execute.js";
import { ProviderRequestError } from "../providers/errors.js";

const prospect = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ada Lovelace",
  email: "ada@analytical.example",
  companyName: "Analytical Engines",
  companyDomain: "analytical.example",
  linkedinUrl: null,
};

describe("enrichment jobs", () => {
  it("retries timeouts and then dead-letters without charging credits", async () => {
    const enrich = vi.fn(async () => {
      throw new ProviderRequestError("timeout", "timed out");
    });
    const result = await executeEnrichment(prospect, { enrich, sleep: async () => undefined, maxAttempts: 2 });
    expect(enrich).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "dead_letter", credits: 0, errorCode: "timeout" });
  });

  it("does not mark an email verified unless the verification provider confirms it", async () => {
    const result = await executeEnrichment(prospect, {
      enrich: async () => [
        {
          field: "businessEmail",
          value: "ada@analytical.example",
          source: "apollo",
          verified: false,
          retrievedAt: "2026-11-24T00:00:00.000Z",
        },
        {
          field: "jobTitle",
          value: "VP Operations",
          source: "apollo",
          verified: false,
          retrievedAt: "2026-11-24T00:00:00.000Z",
        },
      ],
      verifyEmail: async () => ({
        result: "risky",
        status: "accept_all",
        score: 40,
        source: "hunter",
        verified: false,
      }),
    });

    expect(result.status).toBe("succeeded");
    expect(result.fields.find((field) => field.field === "businessEmail")?.verified).toBe(false);
    expect(result.fields.find((field) => field.field === "emailVerification")).toMatchObject({
      value: "risky",
      verified: false,
      source: "hunter",
    });
    expect(result.credits).toBe(4);
  });

  it("fails immediately for invalid credentials", async () => {
    const enrich = vi.fn(async () => {
      throw new ProviderRequestError("invalid_credentials", "rejected");
    });
    const result = await executeEnrichment(prospect, { enrich, maxAttempts: 3 });
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failed");
  });
});
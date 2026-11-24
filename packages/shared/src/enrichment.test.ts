import { describe, expect, it } from "vitest";
import { nextEnrichmentStatus, presentFields, verificationFromProvider } from "./enrichment.js";

describe("enrichment results", () => {
  it("keeps only provider-supplied values and verifies email only when the provider says deliverable", () => {
    const fields = presentFields([
      { field: "fullName", value: "Ada Lovelace", source: "apollo", retrievedAt: "2026-11-24T00:00:00.000Z" },
      { field: "businessEmail", value: "   ", source: "apollo", retrievedAt: "2026-11-24T00:00:00.000Z" },
      { field: "employeeCount", value: null, source: "apollo", retrievedAt: "2026-11-24T00:00:00.000Z" },
    ]);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.verified).toBe(false);

    expect(verificationFromProvider({ result: "deliverable", status: "valid", source: "hunter" }).verified).toBe(true);
    expect(verificationFromProvider({ result: "risky", status: "accept_all", source: "hunter" }).verified).toBe(false);
    expect(verificationFromProvider({ result: "unexpected", status: "unknown", source: "hunter" }).result).toBe("unknown");
  });

  it("retries timeouts and dead-letters after the attempt budget", () => {
    expect(nextEnrichmentStatus({ attempt: 1, maxAttempts: 3, result: { ok: false, fields: [], retryable: true, code: "timeout" } })).toBe("pending");
    expect(nextEnrichmentStatus({ attempt: 3, maxAttempts: 3, result: { ok: false, fields: [], retryable: true, code: "timeout" } })).toBe("dead_letter");
    expect(nextEnrichmentStatus({ attempt: 1, maxAttempts: 3, result: { ok: false, fields: [], retryable: false, code: "invalid_credentials" } })).toBe("failed");
    expect(nextEnrichmentStatus({ attempt: 1, maxAttempts: 3, result: { ok: true, fields: [], retryable: false } })).toBe("succeeded");
  });
});
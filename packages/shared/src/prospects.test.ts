import { describe, expect, it } from "vitest";
import { findDuplicatePairs, mapCsvImport, parseCsv } from "./prospects.js";

describe("prospect import and duplicates", () => {
  it("parses quoted csv rows and reports invalid and duplicate rows", () => {
    const rows = parseCsv('full_name,email,company\n"Ada, Lovelace",ada@example.com,Analytical\nBad,not-an-email,Analytical\n');
    expect(rows[1]).toEqual(["Ada, Lovelace", "ada@example.com", "Analytical"]);

    const mapped = mapCsvImport({
      headers: rows[0] ?? [],
      rows: rows.slice(1),
      mapping: { fullName: "full_name", email: "email", companyName: "company" },
      existingEmails: ["ada@example.com"],
      existingDomains: [],
    });

    expect(mapped[0]).toMatchObject({ errors: [], duplicateOf: "email:ada@example.com" });
    expect(mapped[1]?.errors.join(" ")).toContain("Email");
    expect(mapped[1]?.draft).toBeNull();
  });

  it("does not treat uncertain name matches as likely duplicates", () => {
    const pairs = findDuplicatePairs([
      { id: "1", fullName: "Ada Lovelace", normalizedEmail: "ada@example.com", domain: "analytical.example", linkedinUrl: null },
      { id: "2", fullName: "Ada Lovelace", normalizedEmail: "ada.other@example.com", domain: "analytical.example", linkedinUrl: null },
      { id: "3", fullName: "Grace Hopper", normalizedEmail: null, domain: "navy.example", linkedinUrl: "https://www.linkedin.com/in/grace" },
      { id: "4", fullName: "Grace H.", normalizedEmail: null, domain: "other.example", linkedinUrl: "https://www.linkedin.com/in/grace" },
    ]);

    expect(pairs).toEqual([
      {
        leftId: "1",
        rightId: "2",
        reason: "Same company domain and similar name",
        confidence: "uncertain",
      },
      {
        leftId: "3",
        rightId: "4",
        reason: "Same professional profile URL",
        confidence: "likely",
      },
    ]);
  });
});

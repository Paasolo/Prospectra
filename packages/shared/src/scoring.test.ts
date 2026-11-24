import { describe, expect, it } from "vitest";
import { emptyIcpCriteria } from "./icp.js";
import { scoreProspect } from "./scoring.js";

const subject = {
  fullName: "Ada Lovelace",
  email: "ada@analytical.example",
  jobTitle: "VP Operations",
  seniority: "VP",
  department: "Operations",
  location: "Stockholm, Sweden",
  linkedinUrl: "https://www.linkedin.com/in/ada",
  companyName: "Analytical Engines",
  companyWebsite: "https://analytical.example",
  industry: "Industrial software",
  employeeCount: 120,
  technologies: ["SAP"],
  buyingSignals: ["Hiring planners"],
  businessModel: "B2B subscription",
};

describe("prospect scoring", () => {
  it("is reproducible and explains matches", () => {
    const icp = {
      ...emptyIcpCriteria(),
      industry: "Industrial software",
      geography: ["Sweden"],
      employeeRange: { min: 50, max: 500 },
      targetJobTitles: ["VP Operations"],
      seniority: ["VP"],
      technologies: ["SAP"],
      buyingSignals: ["Hiring planners"],
    };
    const first = scoreProspect({ subject, icp });
    const second = scoreProspect({ subject, icp });
    expect(first).toEqual(second);
    expect(first.score).toBe(100);
    expect(first.category).toBe("strong_fit");
    expect(first.recommendedAction).toBe("prioritize");
    expect(first.explanation).toContain("Score 100/100");
  });

  it("lowers the score when industry does not match and avoids a fit label without an ICP", () => {
    const mismatched = scoreProspect({
      subject,
      icp: {
        ...emptyIcpCriteria(),
        industry: "Healthcare",
        geography: ["Sweden"],
        employeeRange: { min: 50, max: 500 },
        targetJobTitles: ["VP Operations"],
        seniority: ["VP"],
        technologies: ["SAP"],
        buyingSignals: ["Hiring planners"],
      },
    });
    expect(mismatched.score).toBe(83);
    expect(mismatched.negativeFactors.map((factor) => factor.dimension)).toContain("Industry");

    const missing = scoreProspect({ subject, icp: null });
    expect(missing.category).toBe("insufficient_criteria");
    expect(missing.recommendedAction).toBe("collect_data");
    expect(missing.inputs.icpSpecified).toBe(false);
  });
});

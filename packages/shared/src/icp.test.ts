import { describe, expect, it } from "vitest";
import { assessIcpQuality, buildSearchFilters, emptyIcpCriteria, icpRecommendationSchema } from "./icp.js";

describe("ICP quality and filters", () => {
  it("scores a specific ICP higher than an empty one and builds search filters", () => {
    const empty = assessIcpQuality(emptyIcpCriteria(), "");
    const specific = assessIcpQuality(
      {
        ...emptyIcpCriteria(),
        industry: "Industrial software",
        subIndustry: "Plant scheduling",
        geography: ["Sweden"],
        companySize: "Mid-market",
        employeeRange: { min: 50, max: 500 },
        revenueRange: { min: 5_000_000, max: 50_000_000, currency: "USD" },
        businessModel: "B2B subscription",
        technologies: ["SAP"],
        targetJobTitles: ["VP Operations"],
        departments: ["Operations"],
        seniority: ["VP"],
        painPoints: ["Unplanned downtime", "Manual scheduling"],
        buyingSignals: ["Hiring planners"],
        exclusionCriteria: ["Agencies"],
      },
      "Manufacturers that run their own plants.",
    );

    expect(specific.overall).toBeGreaterThan(empty.overall);
    expect(specific.recommendations).toEqual([]);
    expect(empty.recommendations.length).toBeGreaterThan(0);

    const filters = buildSearchFilters({
      ...emptyIcpCriteria(),
      industry: "Industrial software",
      geography: ["Sweden"],
      employeeRange: { min: 50, max: 500 },
      targetJobTitles: ["VP Operations"],
    });
    expect(filters).toMatchObject({
      industries: ["Industrial software"],
      geographies: ["Sweden"],
      employeeMin: 50,
      employeeMax: 500,
      jobTitles: ["VP Operations"],
    });
  });

  it("flags inconsistent ranges and validates AI recommendation shape", () => {
    const quality = assessIcpQuality({
      ...emptyIcpCriteria(),
      industry: "Software",
      employeeRange: { min: 500, max: 10 },
      exclusionCriteria: ["Software"],
    });
    expect(quality.consistency).toBeLessThan(50);
    expect(quality.recommendations.join(" ")).toContain("Employee minimum");

    const parsed = icpRecommendationSchema.parse({
      name: "Nordic plant software",
      description: "Editable recommendation.",
      industryCriteria: "Industrial software",
      companySizeCriteria: "50-500 employees",
      geographicCriteria: "Sweden",
      decisionMakerProfiles: ["VP Operations"],
      painPoints: ["Downtime"],
      buyingTriggers: ["Hiring"],
      qualificationCriteria: ["Owns production"],
      exclusionCriteria: ["Agencies"],
      explanation: "Based on the supplied description.",
      criteria: {
        ...emptyIcpCriteria(),
        industry: "Industrial software",
        geography: ["Sweden"],
      },
    });
    expect(parsed.name).toBe("Nordic plant software");
  });
});

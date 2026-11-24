import { describe, expect, it, vi } from "vitest";
import { websiteAnalysisOutputSchema } from "@prospectra/shared";
import { createStructuredCompletion } from "./openai.js";

const output = {
  companyOverview: "A software company.",
  productsAndServices: [],
  industries: [],
  targetMarkets: [],
  customerSegments: [],
  valueProposition: "",
  businessModel: "",
  painPointsAddressed: [],
  potentialBuyerRoles: [],
  potentialBuyingSignals: [],
  recommendedIcp: "",
  sourceReferences: [],
  confidenceNotes: "Evidence was limited.",
};

describe("OpenAI structured output", () => {
  it("validates a schema-conforming completion and rejects invalid content", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        model: "gpt-4.1-mini",
        choices: [{ message: { content: JSON.stringify(output) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    ) as typeof fetch;

    const result = await createStructuredCompletion({
      apiKey: "test",
      model: "gpt-4.1-mini",
      schemaName: "website_analysis",
      jsonSchema: { type: "object" },
      messages: [{ role: "system", content: "rules" }],
      parse: (value) => websiteAnalysisOutputSchema.parse(value),
      fetchImpl,
    });
    expect(result.data.companyOverview).toBe("A software company.");
    expect(result.usage.estimatedCostUsd).not.toBeNull();

    const invalid = vi.fn(async () =>
      Response.json({
        model: "gpt-4.1-mini",
        choices: [{ message: { content: JSON.stringify({ companyOverview: "partial" }) } }],
      }),
    ) as typeof fetch;
    await expect(
      createStructuredCompletion({
        apiKey: "test",
        model: "gpt-4.1-mini",
        schemaName: "website_analysis",
        jsonSchema: { type: "object" },
        messages: [],
        parse: (value) => websiteAnalysisOutputSchema.parse(value),
        fetchImpl: invalid,
      }),
    ).rejects.toThrow(/schema validation/);
  });
});

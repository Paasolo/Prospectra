import { describe, expect, it, vi } from "vitest";
import type { CrawlTransportResult } from "../crawl/crawler.js";
import { executeWebsiteAnalysis } from "./execute.js";

describe("website analysis execution", () => {
  it("does not call the model for a blocked destination", async () => {
    const complete = vi.fn();
    const result = await executeWebsiteAnalysis(
      { url: "http://127.0.0.1/secret", openaiApiKey: "test", openaiModel: "gpt-4.1-mini" },
      {
        resolve: async () => [],
        request: async () => {
          throw new Error("network should not be used");
        },
        complete,
      },
    );

    expect(complete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "failed", errorCode: "SSRF_BLOCKED", aiOutput: null });
  });

  it("saves the crawl and reports an unconfigured model instead of inventing a report", async () => {
    const result = await executeWebsiteAnalysis(
      { url: "https://public.example/", openaiModel: "gpt-4.1-mini" },
      {
        resolve: async () => [{ address: "93.184.216.34", family: 4 }],
        request: async ({ url }): Promise<CrawlTransportResult> =>
          url.pathname === "/robots.txt"
            ? { status: 404, headers: {}, body: "" }
            : {
                status: 200,
                headers: { "content-type": "text/html" },
                body: "<html><title>Northwind</title><body>Plant software.</body></html>",
              },
        sleep: async () => undefined,
        now: () => 1,
      },
    );

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("PROVIDER_UNCONFIGURED");
    expect(result.aiOutput).toBeNull();
    expect(result.extractedContent.companyName).toBe("Northwind");
    expect(result.crawledUrls.some((record) => record.status === "fetched")).toBe(true);
  });
});

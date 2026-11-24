import { describe, expect, it, vi } from "vitest";
import { crawlWebsite, type CrawlDependencies, type CrawlTransportResult } from "./crawler.js";

function deps(partial: Partial<CrawlDependencies>): CrawlDependencies {
  return {
    resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    request: async () => ({ status: 200, headers: { "content-type": "text/html" }, body: "<html><title>Ok</title></html>" }),
    sleep: async () => undefined,
    now: () => 0,
    ...partial,
  };
}

describe("website crawler security", () => {
  it("blocks private and metadata destinations before a request is made", async () => {
    const request = vi.fn();
    const resolve = vi.fn(async () => [{ address: "1.1.1.1", family: 4 as const }]);

    for (const target of ["http://127.0.0.1/secret", "http://localhost/admin", "http://169.254.169.254/latest/meta-data"]) {
      const outcome = await crawlWebsite(target, deps({ request, resolve }));
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.code).toBe("SSRF_BLOCKED");
      }
    }

    expect(request).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("blocks a public hostname that resolves to a private address", async () => {
    const request = vi.fn();
    const outcome = await crawlWebsite(
      "https://rebind.example/",
      deps({
        request,
        resolve: async () => [{ address: "10.0.0.4", family: 4 }],
      }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SSRF_BLOCKED");
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("revalidates redirects and does not request a private hop", async () => {
    const requested: string[] = [];
    const outcome = await crawlWebsite(
      "https://public.example/start",
      deps({
        resolve: async (hostname) => {
          if (hostname === "public.example") {
            return [{ address: "93.184.216.34", family: 4 }];
          }
          return [{ address: "127.0.0.1", family: 4 }];
        },
        request: async ({ url, address }): Promise<CrawlTransportResult> => {
          requested.push(`${url.hostname} via ${address}`);
          if (url.pathname === "/robots.txt") {
            return { status: 404, headers: {}, body: "" };
          }
          return {
            status: 302,
            headers: { location: "http://127.0.0.1/secret" },
            body: "",
          };
        },
      }),
    );

    expect(requested.every((entry) => !entry.includes("127.0.0.1"))).toBe(true);
    expect(outcome.ok).toBe(false);
    expect(outcome.records.some((record) => record.status === "blocked")).toBe(true);
  });

  it("records crawled urls, skips unsupported types, and stops at the page limit", async () => {
    const outcome = await crawlWebsite(
      "https://public.example/",
      deps({
        resolve: async () => [{ address: "93.184.216.34", family: 4 }],
        request: async ({ url }) => {
          if (url.pathname === "/robots.txt") {
            return { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /private\n" };
          }
          if (url.pathname === "/file.pdf") {
            return { status: 200, headers: { "content-type": "application/pdf" }, body: "pdf" };
          }
          return {
            status: 200,
            headers: { "content-type": "text/html" },
            body: `<html><title>${url.pathname}</title><a href="/one">1</a><a href="/two">2</a><a href="/file.pdf">pdf</a><a href="https://other.example/off">off</a><a href="/private">no</a></body></html>`,
          };
        },
      }),
      { maxPages: 2, maxDepth: 1, minIntervalMs: 0 },
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.pages.length).toBeLessThanOrEqual(2);
      expect(outcome.normalizedDomain).toBe("public.example");
    }

    const full = await crawlWebsite(
      "https://public.example/",
      deps({
        resolve: async () => [{ address: "93.184.216.34", family: 4 }],
        request: async ({ url }) => {
          if (url.pathname === "/robots.txt") {
            return { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /private\n" };
          }
          if (url.pathname === "/file.pdf") {
            return { status: 200, headers: { "content-type": "application/pdf" }, body: "pdf" };
          }
          return {
            status: 200,
            headers: { "content-type": "text/html" },
            body: `<html><title>${url.pathname}</title><a href="/one">1</a><a href="/file.pdf">pdf</a><a href="https://other.example/off">off</a><a href="/private">no</a></body></html>`,
          };
        },
      }),
      { maxPages: 5, maxDepth: 1, minIntervalMs: 0 },
    );
    expect(full.records.map((record) => record.url)).toContain("https://public.example/");
    expect(full.records.some((record) => record.status === "disallowed" && record.url.includes("/private"))).toBe(true);
    expect(full.records.some((record) => record.status === "skipped" && record.url.includes("/file.pdf"))).toBe(true);
    expect(full.records.some((record) => record.url.includes("other.example"))).toBe(false);
  });
});

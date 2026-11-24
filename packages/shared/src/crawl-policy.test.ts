import { describe, expect, it } from "vitest";
import { contentTypeAllowed, createRateLimiter, parseRobotsTxt, robotsAllows } from "./crawl-policy.js";

describe("crawl policy", () => {
  it("allows only html and plain text responses", () => {
    expect(contentTypeAllowed("text/html; charset=utf-8")).toBe(true);
    expect(contentTypeAllowed("application/pdf")).toBe(false);
    expect(contentTypeAllowed(undefined)).toBe(false);
  });

  it("respects the matching robots group and longest rule", () => {
    const rules = parseRobotsTxt(`
      User-agent: *
      Disallow: /private
      Allow: /private/public

      User-agent: ProspectraBot
      Disallow: /admin
    `);
    expect(robotsAllows("/pricing", rules)).toBe(true);
    expect(robotsAllows("/admin", rules)).toBe(false);
    expect(robotsAllows("/private", rules)).toBe(true);

    const wildcard = parseRobotsTxt("User-agent: *\nDisallow: /private\nAllow: /private/public\n");
    expect(robotsAllows("/private/secret", wildcard)).toBe(false);
    expect(robotsAllows("/private/public", wildcard)).toBe(true);
  });

  it("rate limits repeated keys inside the window", () => {
    let now = 1_000;
    const limiter = createRateLimiter(2, 1_000, () => now);
    expect(limiter.check("workspace").ok).toBe(true);
    expect(limiter.check("workspace").ok).toBe(true);
    const blocked = limiter.check("workspace");
    expect(blocked.ok).toBe(false);
    now = 2_100;
    expect(limiter.check("workspace").ok).toBe(true);
  });
});

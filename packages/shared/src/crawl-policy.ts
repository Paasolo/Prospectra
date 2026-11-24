export const CRAWL_LIMITS = {
  maxPages: 8,
  maxDepth: 2,
  maxBytes: 500_000,
  timeoutMs: 8_000,
  maxDurationMs: 40_000,
  maxRedirects: 3,
  minIntervalMs: 750,
  maxAnalysisRequestsPerMinute: 5,
} as const;

export type CrawlLimits = {
  maxPages: number;
  maxDepth: number;
  maxBytes: number;
  timeoutMs: number;
  maxDurationMs: number;
  maxRedirects: number;
  minIntervalMs: number;
};

export const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"] as const;

export const CRAWLER_USER_AGENT = "ProspectraBot/0.1 (+https://prospectra.app/bot; website-analysis)";

export function contentTypeAllowed(header: string | undefined): boolean {
  if (!header) {
    return false;
  }
  const mime = header.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_CONTENT_TYPES.some((allowed) => mime === allowed);
}

export type RobotsRule = { type: "allow" | "disallow"; path: string };

export function parseRobotsTxt(body: string, userAgent = CRAWLER_USER_AGENT): RobotsRule[] {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) {
      continue;
    }
    if (field === "disallow" || field === "allow") {
      current.rules.push({ type: field, path: value });
    }
  }

  const agent = userAgent.toLowerCase();
  const specific = groups.find((group) =>
    group.agents.some((name) => name !== "*" && agent.includes(name)),
  );
  const wildcard = groups.find((group) => group.agents.includes("*"));
  return (specific ?? wildcard)?.rules ?? [];
}

export function robotsAllows(pathname: string, rules: RobotsRule[]): boolean {
  let winner: RobotsRule | null = null;
  for (const rule of rules) {
    if (!rule.path) {
      continue;
    }
    if (!pathname.startsWith(rule.path)) {
      continue;
    }
    if (!winner || rule.path.length > winner.path.length) {
      winner = rule;
      continue;
    }
    if (rule.path.length === winner.path.length && rule.type === "allow") {
      winner = rule;
    }
  }
  return winner?.type !== "disallow";
}

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();

  return {
    check(key: string): { ok: true } | { ok: false; retryAfterMs: number } {
      const timestamp = now();
      const recent = (hits.get(key) ?? []).filter((hit) => timestamp - hit < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const retryAfterMs = Math.max(0, windowMs - (timestamp - (recent[0] ?? timestamp)));
        return { ok: false, retryAfterMs };
      }
      recent.push(timestamp);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}

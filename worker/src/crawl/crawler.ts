import {
  CRAWL_LIMITS,
  contentTypeAllowed,
  extractLinks,
  hostsEquivalent,
  htmlToText,
  parsePublicHttpUrl,
  parseRobotsTxt,
  robotsAllows,
  isBlockedIp,
  type CrawlLimits,
} from "@prospectra/shared";

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type CrawlTransportResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type CrawlDependencies = {
  resolve: (hostname: string) => Promise<ResolvedAddress[]>;
  request: (target: {
    url: URL;
    address: string;
    family: 4 | 6;
    timeoutMs: number;
    maxBytes: number;
  }) => Promise<CrawlTransportResult>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type CrawlRecord = {
  url: string;
  status: "fetched" | "blocked" | "disallowed" | "skipped" | "error";
  reason?: string;
  contentType?: string;
};

export type CrawlPage = {
  url: string;
  depth: number;
  contentType: string;
  title: string | null;
  text: string;
  html: string;
};

export type CrawlOutcome =
  | {
      ok: true;
      normalizedDomain: string;
      records: CrawlRecord[];
      pages: CrawlPage[];
    }
  | {
      ok: false;
      code: "SSRF_BLOCKED" | "CRAWL_FAILED" | "VALIDATION_FAILED";
      message: string;
      records: CrawlRecord[];
      pages: CrawlPage[];
    };

type QueueItem = { url: URL; depth: number };

function limitsFrom(overrides?: Partial<CrawlLimits>): CrawlLimits {
  return { ...CRAWL_LIMITS, ...overrides };
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found?.[1];
}

async function gate(
  url: URL,
  deps: CrawlDependencies,
): Promise<{ ok: true; address: ResolvedAddress } | { ok: false; code: "SSRF_BLOCKED" | "CRAWL_FAILED"; reason: string }> {
  const decision = parsePublicHttpUrl(url.href);
  if (!decision.ok) {
    return { ok: false, code: decision.code === "VALIDATION_FAILED" ? "SSRF_BLOCKED" : decision.code, reason: decision.reason };
  }

  const hostname = decision.url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = hostname.includes(":") ? 6 : /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ? 4 : null;
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await deps.resolve(hostname);

  if (!addresses.length) {
    return { ok: false, code: "CRAWL_FAILED", reason: "DNS resolution returned no addresses." };
  }
  if (addresses.some((item) => isBlockedIp(item.address))) {
    return { ok: false, code: "SSRF_BLOCKED", reason: "Destination resolves to a private, local, or metadata address." };
  }
  const address = addresses[0];
  if (!address) {
    return { ok: false, code: "CRAWL_FAILED", reason: "DNS resolution returned no addresses." };
  }
  return { ok: true, address };
}

function titleFrom(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

export async function crawlWebsite(
  rawUrl: string,
  deps: CrawlDependencies,
  overrides?: Partial<CrawlLimits>,
): Promise<CrawlOutcome> {
  const limits = limitsFrom(overrides);
  const sleep = deps.sleep ?? (async () => undefined);
  const now = deps.now ?? Date.now;
  const started = now();
  const records: CrawlRecord[] = [];
  const pages: CrawlPage[] = [];
  const decision = parsePublicHttpUrl(rawUrl);

  if (!decision.ok) {
    records.push({ url: rawUrl, status: "blocked", reason: decision.reason });
    return { ok: false, code: decision.code, message: decision.reason, records, pages };
  }

  const origin = decision.url;
  const robotsUrl = new URL("/robots.txt", origin.origin);
  let rules: ReturnType<typeof parseRobotsTxt> = [];
  const robotsGate = await gate(robotsUrl, deps);
  if (!robotsGate.ok) {
    records.push({ url: robotsUrl.href, status: "blocked", reason: robotsGate.reason });
    return { ok: false, code: robotsGate.code, message: robotsGate.reason, records, pages };
  }

  try {
    const robotsResponse = await deps.request({
      url: robotsUrl,
      address: robotsGate.address.address,
      family: robotsGate.address.family,
      timeoutMs: limits.timeoutMs,
      maxBytes: limits.maxBytes,
    });
    records.push({
      url: robotsUrl.href,
      status: robotsResponse.status === 200 ? "fetched" : "skipped",
      contentType: header(robotsResponse.headers, "content-type"),
      reason: robotsResponse.status === 200 ? undefined : `robots.txt returned ${robotsResponse.status}`,
    });
    if (robotsResponse.status === 200) {
      rules = parseRobotsTxt(robotsResponse.body);
    }
  } catch (error) {
    records.push({
      url: robotsUrl.href,
      status: "error",
      reason: error instanceof Error ? error.message : "Could not read robots.txt",
    });
  }

  const queue: QueueItem[] = [{ url: origin, depth: 0 }];
  const seen = new Set<string>();
  let lastRequestAt = 0;

  while (queue.length && pages.length < limits.maxPages && now() - started < limits.maxDurationMs) {
    const item = queue.shift();
    if (!item || seen.has(item.url.href)) {
      continue;
    }
    seen.add(item.url.href);

    if (!robotsAllows(item.url.pathname || "/", rules)) {
      records.push({ url: item.url.href, status: "disallowed", reason: "Blocked by robots.txt." });
      continue;
    }

    let current = item.url;
    let redirects = 0;
    let response: CrawlTransportResult | null = null;
    let allowedAddress: ResolvedAddress | null = null;

    while (redirects <= limits.maxRedirects) {
      const opened = await gate(current, deps);
      if (!opened.ok) {
        records.push({ url: current.href, status: "blocked", reason: opened.reason });
        response = null;
        break;
      }
      allowedAddress = opened.address;
      const elapsed = now() - lastRequestAt;
      if (lastRequestAt && elapsed < limits.minIntervalMs) {
        await sleep(limits.minIntervalMs - elapsed);
      }
      lastRequestAt = now();
      try {
        response = await deps.request({
          url: current,
          address: opened.address.address,
          family: opened.address.family,
          timeoutMs: limits.timeoutMs,
          maxBytes: limits.maxBytes,
        });
      } catch (error) {
        records.push({
          url: current.href,
          status: "error",
          reason: error instanceof Error ? error.message : "Request failed",
        });
        response = null;
        break;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = header(response.headers, "location");
        if (!location) {
          records.push({ url: current.href, status: "error", reason: "Redirect was missing a location." });
          response = null;
          break;
        }
        redirects += 1;
        if (redirects > limits.maxRedirects) {
          records.push({ url: current.href, status: "error", reason: "Too many redirects." });
          response = null;
          break;
        }
        records.push({ url: current.href, status: "skipped", reason: `Redirect ${response.status}` });
        try {
          current = new URL(location, current);
        } catch {
          records.push({ url: location, status: "blocked", reason: "Redirect location was not a valid URL." });
          response = null;
          break;
        }
        continue;
      }
      break;
    }

    if (!response || !allowedAddress) {
      continue;
    }

    const contentType = header(response.headers, "content-type");
    if (!contentTypeAllowed(contentType)) {
      records.push({
        url: current.href,
        status: "skipped",
        contentType,
        reason: "Content type is not supported.",
      });
      continue;
    }
    if (response.body.length > limits.maxBytes) {
      records.push({ url: current.href, status: "error", contentType, reason: "Response exceeded the size limit." });
      continue;
    }

    records.push({ url: current.href, status: "fetched", contentType });
    const html = response.body;
    pages.push({
      url: current.href,
      depth: item.depth,
      contentType: contentType ?? "text/html",
      title: titleFrom(html),
      text: htmlToText(html).slice(0, 4000),
      html,
    });

    if (item.depth < limits.maxDepth && (contentType ?? "").includes("html")) {
      for (const link of extractLinks(html, current.href)) {
        let linked: URL;
        try {
          linked = new URL(link);
        } catch {
          continue;
        }
        if (!hostsEquivalent(linked.hostname, origin.hostname) || seen.has(linked.href)) {
          continue;
        }
        queue.push({ url: linked, depth: item.depth + 1 });
      }
    }
  }

  if (!pages.length) {
    const blocked = records.find((record) => record.status === "blocked");
    return {
      ok: false,
      code: blocked ? "SSRF_BLOCKED" : "CRAWL_FAILED",
      message: blocked?.reason || records.at(-1)?.reason || "No public page could be fetched.",
      records,
      pages,
    };
  }

  return {
    ok: true,
    normalizedDomain: origin.hostname.toLowerCase().replace(/^www\./, ""),
    records,
    pages,
  };
}

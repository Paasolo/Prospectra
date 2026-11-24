import http from "node:http";
import https from "node:https";
import { lookup, resolve4, resolve6 } from "node:dns/promises";
import tls from "node:tls";
import { CRAWLER_USER_AGENT } from "@prospectra/shared";
import type { CrawlTransportResult, ResolvedAddress } from "./crawler.js";

export async function resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  const found = new Map<string, ResolvedAddress>();
  const add = (address: string, family: number) => {
    found.set(`${family}:${address}`, { address, family: family === 6 ? 6 : 4 });
  };

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    for (const record of records) {
      add(record.address, record.family);
    }
  } catch {
    // Continue with authoritative lookups so a single resolver failure is not a bypass.
  }

  try {
    for (const address of await resolve4(hostname)) {
      add(address, 4);
    }
  } catch {
    // No A records.
  }

  try {
    for (const address of await resolve6(hostname)) {
      add(address, 6);
    }
  } catch {
    // No AAAA records.
  }

  return [...found.values()];
}

export function requestPinned(target: {
  url: URL;
  address: string;
  family: 4 | 6;
  timeoutMs: number;
  maxBytes: number;
}): Promise<CrawlTransportResult> {
  const lib = target.url.protocol === "https:" ? https : http;
  const port = target.url.port || (target.url.protocol === "https:" ? 443 : 80);

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: target.url.protocol,
        host: target.address,
        port,
        method: "GET",
        path: `${target.url.pathname}${target.url.search}`,
        headers: {
          host: target.url.hostname,
          "user-agent": CRAWLER_USER_AGENT,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1",
        },
        servername: target.url.hostname,
        rejectUnauthorized: true,
        checkServerIdentity: (_host, cert) => tls.checkServerIdentity(target.url.hostname, cert),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > target.maxBytes) {
            req.destroy(new Error("Response exceeded the size limit."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") {
              headers[key] = value;
            } else if (Array.isArray(value)) {
              headers[key] = value.join(", ");
            }
          }
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.setTimeout(target.timeoutMs, () => {
      req.destroy(new Error("Request timed out."));
    });
    req.on("error", reject);
    req.end();
  });
}

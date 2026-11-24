import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { getWorkerConfig } from "../config.js";
import { createWorkerHandler } from "./server.js";

function request(address: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = "POST";
  req.url = "/v1/website-analyses";
  req.headers = {};
  req.socket = { remoteAddress: address } as IncomingMessage["socket"];
  return req;
}

function response() {
  let statusCode = 0;
  let raw = "";
  const res = {
    writeHead(code: number) {
      statusCode = code;
      return res;
    },
    end(body?: string) {
      raw = body ?? "";
    },
  };
  return {
    res: res as unknown as ServerResponse,
    status: () => statusCode,
    json: () => JSON.parse(raw) as { code?: string; message?: string },
  };
}

describe("worker request behaviour without credentials", () => {
  it("reports Supabase as unconfigured and then rate limits the address", async () => {
    const handle = createWorkerHandler(getWorkerConfig({ WORKER_PORT: "8787" }));
    const first = response();
    await handle(request("203.0.113.20"), first.res);
    expect(first.status()).toBe(503);
    expect(first.json().code).toBe("PROVIDER_UNCONFIGURED");
    expect(first.json().message).toMatch(/Supabase is not configured/);
    expect(first.json().message).not.toMatch(/duplicate key|stack/i);

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const allowed = response();
      await handle(request("203.0.113.21"), allowed.res);
      expect(allowed.status()).toBe(503);
    }
    const limited = response();
    await handle(request("203.0.113.21"), limited.res);
    expect(limited.status()).toBe(429);
    expect(limited.json().code).toBe("RATE_LIMITED");
  });
});

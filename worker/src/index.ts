import { createServer } from "node:http";
import { APP_VERSION, healthResponseSchema } from "@prospectra/shared";
import { createOutreachAdmin, processDueOutreach } from "./campaigns/process.js";
import { getWorkerConfig } from "./config.js";
import { createWorkerHandler } from "./http/server.js";
import { loadLocalEnv } from "./load-env.js";
import { registerPlatformJobs } from "./processors/register.js";
import { createJobRunner } from "./queues/job-runner.js";
import { backgroundInflight, processBackgroundQueue } from "./queues/process-jobs.js";

loadLocalEnv();

const startedAt = Date.now();
const config = getWorkerConfig();
const jobRunner = createJobRunner();
const outreachAdmin = createOutreachAdmin(config);
if (outreachAdmin) {
  registerPlatformJobs(jobRunner, { admin: outreachAdmin, config });
}
jobRunner.register("outreach.send", async () => undefined);
const handle = createWorkerHandler(config);
const pollMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 15000);
if (outreachAdmin && Number.isFinite(pollMs) && pollMs >= 1000) {
  setInterval(() => {
    if (jobRunner.isStopped()) return;
    void processDueOutreach(outreachAdmin, config).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "error", message: "Outreach poll failed", detail: error instanceof Error ? error.message : "unknown" }));
    });
    void processBackgroundQueue(outreachAdmin, jobRunner).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "error", message: "Background queue poll failed", detail: error instanceof Error ? error.message : "unknown" }));
    });
  }, pollMs);
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const payload = healthResponseSchema.parse({
      service: "prospectra-worker",
      status: "ok",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
    return;
  }

  void handle(req, res);
});

server.listen(config.port, "0.0.0.0", () => {
  // Structured startup log.
  console.log(
    JSON.stringify({
      level: "info",
      message: "Prospectra worker listening",
      port: config.port,
      registeredJobTypes: jobRunner.listRegisteredTypes(),
      timestamp: new Date().toISOString(),
    }),
  );
});

function shutdown(signal: string): void {
  jobRunner.stop();
  console.log(
    JSON.stringify({
      level: "info",
      message: "Prospectra worker shutting down",
      signal,
      timestamp: new Date().toISOString(),
    }),
  );
  const started = Date.now();
  const timer = setInterval(() => {
    if (backgroundInflight() === 0 || Date.now() - started > 10_000) {
      clearInterval(timer);
      server.close(() => process.exit(0));
    }
  }, 200);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

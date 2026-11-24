import { workerHealthOk } from "../packages/shared/dist/index.js";

const appUrl = process.env.SMOKE_APP_URL?.trim();
const workerUrl = process.env.SMOKE_WORKER_URL?.trim();

if (!appUrl && !workerUrl) {
  console.log(
    JSON.stringify({
      level: "info",
      message: "Live smoke was not run. Set SMOKE_APP_URL and SMOKE_WORKER_URL to check a deployed environment.",
    }),
  );
  process.exit(0);
}

async function check(url, label, accept) {
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!accept(response.status, body)) {
    console.error(JSON.stringify({ level: "error", message: `${label} smoke failed`, url, status: response.status }));
    process.exit(1);
  }
}

if (workerUrl) {
  await check(new URL("/health", workerUrl), "worker", (status, body) => workerHealthOk(status, body));
}

if (appUrl) {
  const response = await fetch(appUrl);
  const text = await response.text();
  if (response.status !== 200 || !text.toLowerCase().includes("prospectra")) {
    console.error(JSON.stringify({ level: "error", message: "app smoke failed", url: appUrl, status: response.status }));
    process.exit(1);
  }
}

console.log(JSON.stringify({ level: "info", message: "Smoke checks passed.", appUrl: Boolean(appUrl), workerUrl: Boolean(workerUrl) }));

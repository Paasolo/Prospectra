import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function applyEnvFile(text: string, env: NodeJS.ProcessEnv = process.env): void {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    if (env[key]?.trim()) {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
}

export function loadLocalEnv(moduleUrl = import.meta.url): void {
  const here = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../.env"),
    resolve(here, "../../.env"),
    resolve(here, "../../../.env"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    return;
  }
  applyEnvFile(readFileSync(path, "utf8"));
}

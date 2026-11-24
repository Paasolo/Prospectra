import { createHash } from "node:crypto";

export function rateLimitKeys(remoteAddress: string | undefined, authorization: string | undefined): string[] {
  const ip = `ip:${remoteAddress && remoteAddress.length > 0 ? remoteAddress : "unknown"}`;
  const header = authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || token.length > 4096 || token.split(".").length !== 3) {
    return [ip];
  }
  return [ip, `token:${createHash("sha256").update(token).digest("hex")}`];
}

import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyStripeSignature(payload: string, header: string | undefined, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const timestamp = header.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const signatures = header.split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const issued = Number(timestamp);
  if (!Number.isFinite(issued) || signatures.length === 0) return false;
  if (Math.abs(now - issued * 1000) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${issued}.${payload}`).digest("hex");
  return signatures.some((candidate) => safeEqual(candidate, expected));
}

export function verifyPaystackSignature(payload: string, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = createHmac("sha512", secret).update(payload).digest("hex");
  return safeEqual(header, expected);
}

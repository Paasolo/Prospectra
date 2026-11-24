import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthState = {
  workspaceId: string;
  userId: string;
  provider: "gmail" | "microsoft";
  kind: "email" | "calendar";
  exp: number;
};

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
};

export function encryptJson(value: unknown, keyMaterial: string): string {
  const key = createHash("sha256").update(keyMaterial).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decryptJson(payload: string, keyMaterial: string): unknown {
  const key = createHash("sha256").update(keyMaterial).digest();
  const buffer = Buffer.from(payload, "base64url");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as unknown;
}

export function signState(state: Omit<OAuthState, "exp">, key: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...state, exp: now + 10 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readState(token: string, key: string, now = Date.now()): OAuthState {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    throw new Error("Invalid OAuth state.");
  }
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("Invalid OAuth state.");
  }
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
  if (!parsed.exp || parsed.exp < now) {
    throw new Error("OAuth state expired.");
  }
  return parsed;
}

import { verificationFromProvider, type EmailVerification } from "@prospectra/shared";
import { z } from "zod";
import { ProviderRequestError, providerErrorFromStatus, providerErrorFromUnknown } from "./errors.js";

const hunterSchema = z.object({
  data: z.object({
    status: z.string(),
    result: z.string(),
    score: z.number().optional(),
  }),
});

export function normalizeHunterVerification(payload: unknown): EmailVerification {
  const parsed = hunterSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ProviderRequestError("invalid_response", "Hunter returned an unexpected verification payload.");
  }
  return verificationFromProvider({
    result: parsed.data.data.result,
    status: parsed.data.data.status,
    score: parsed.data.data.score ?? null,
    source: "hunter",
  });
}

export function createHunterClient(apiKey: string, fetchImpl: typeof fetch = fetch) {
  return {
    async verify(email: string): Promise<EmailVerification> {
      const url = new URL("https://api.hunter.io/v2/email-verifier");
      url.searchParams.set("email", email);
      url.searchParams.set("api_key", apiKey);
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
        const text = await response.text();
        if (!response.ok) {
          throw providerErrorFromStatus(response.status, text);
        }
        let json: unknown;
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          throw new ProviderRequestError("invalid_response", "Hunter returned invalid JSON.");
        }
        return normalizeHunterVerification(json);
      } catch (error) {
        throw providerErrorFromUnknown(error);
      }
    },
  };
}

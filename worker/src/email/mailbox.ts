import { deliveryFromProvider, sendFailureKind, type DeliveryState } from "@prospectra/shared";
import { z } from "zod";
import { providerErrorFromStatus, ProviderRequestError } from "../providers/errors.js";

export type MailAccepted = {
  deliveryState: "accepted";
  providerMessageId: string | null;
  providerThreadId: string | null;
  providerResponse: Record<string, unknown>;
};

const gmailSendSchema = z.object({ id: z.string(), threadId: z.string().optional() });
const resendSchema = z.object({ id: z.string() });
const graphMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string().optional(),
  isDraft: z.boolean().optional(),
});

export function googleAuthUrl(input: { clientId: string; redirectUri: string; state: string; kind: "email" | "calendar" }): string {
  const scopes =
    input.kind === "email"
      ? ["openid", "email", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"]
      : ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"];
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function microsoftAuthUrl(input: { clientId: string; redirectUri: string; state: string; kind: "email" | "calendar" }): string {
  const scopes =
    input.kind === "email"
      ? ["offline_access", "User.Read", "Mail.Send", "Mail.Read"]
      : ["offline_access", "User.Read", "Calendars.ReadWrite"];
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: scopes.join(" "),
    state: input.state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export function buildRfc822(input: { from: string; to: string; subject: string; body: string; messageId: string }): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`;
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodedSubject}`,
    `Message-ID: <${input.messageId}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
  ].join("\r\n");
}

async function readError(response: Response): Promise<string> {
  return (await response.text()).slice(0, 500);
}

export function createMailbox(fetchImpl: typeof fetch = fetch) {
  return {
    async exchangeGoogleCode(input: { clientId: string; clientSecret: string; code: string; redirectUri: string }) {
      const response = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: input.code,
          client_id: input.clientId,
          client_secret: input.clientSecret,
          redirect_uri: input.redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, await readError(response));
      }
      return z
        .object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number().optional() })
        .parse(await response.json());
    },

    async refreshGoogle(input: { clientId: string; clientSecret: string; refreshToken: string }) {
      const response = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          refresh_token: input.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, await readError(response));
      }
      return z.object({ access_token: z.string(), expires_in: z.number().optional() }).parse(await response.json());
    },

    async revokeGoogle(token: string) {
      const response = await fetchImpl("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
      return response.ok;
    },

    async sendGmail(accessToken: string, raw: string): Promise<MailAccepted> {
      const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(raw, "utf8").toString("base64url") }),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, text);
      }
      const parsed = gmailSendSchema.parse(JSON.parse(text) as unknown);
      return {
        deliveryState: deliveryFromProvider({ httpStatus: response.status }) as "accepted",
        providerMessageId: parsed.id,
        providerThreadId: parsed.threadId ?? null,
        providerResponse: { id: parsed.id, threadId: parsed.threadId ?? null },
      };
    },

    async findGmailByMessageId(accessToken: string, messageId: string): Promise<MailAccepted | null> {
      const query = new URLSearchParams({ q: `rfc822msgid:${messageId}`, maxResults: "1" });
      const response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query.toString()}`, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, await response.text());
      }
      const parsed = z.object({ messages: z.array(z.object({ id: z.string(), threadId: z.string().optional() })).optional() }).parse(await response.json());
      const found = parsed.messages?.[0];
      if (!found) {
        return null;
      }
      return {
        deliveryState: "accepted",
        providerMessageId: found.id,
        providerThreadId: found.threadId ?? null,
        providerResponse: found,
      };
    },

    async exchangeMicrosoftCode(input: { clientId: string; clientSecret: string; code: string; redirectUri: string }) {
      const response = await fetchImpl("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          code: input.code,
          redirect_uri: input.redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, await readError(response));
      }
      return z
        .object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number().optional() })
        .parse(await response.json());
    },

    async refreshMicrosoft(input: { clientId: string; clientSecret: string; refreshToken: string }) {
      const response = await fetchImpl("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          refresh_token: input.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, await readError(response));
      }
      return z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number().optional() }).parse(await response.json());
    },

    async sendMicrosoft(accessToken: string, input: { from: string; to: string; subject: string; body: string }): Promise<MailAccepted> {
      const draftResponse = await fetchImpl("https://graph.microsoft.com/v1.0/me/messages", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          subject: input.subject,
          body: { contentType: "Text", content: input.body },
          toRecipients: [{ emailAddress: { address: input.to } }],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const draftText = await draftResponse.text();
      if (!draftResponse.ok) {
        throw providerErrorFromStatus(draftResponse.status, draftText);
      }
      const draft = graphMessageSchema.parse(JSON.parse(draftText) as unknown);
      const sendResponse = await fetchImpl(`https://graph.microsoft.com/v1.0/me/messages/${draft.id}/send`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!sendResponse.ok) {
        const error = providerErrorFromStatus(sendResponse.status, await sendResponse.text());
        (error as ProviderRequestError & { providerMessageId?: string }).providerMessageId = draft.id;
        throw error;
      }
      return {
        deliveryState: "accepted",
        providerMessageId: draft.id,
        providerThreadId: draft.conversationId ?? null,
        providerResponse: { id: draft.id, conversationId: draft.conversationId ?? null, accepted: true },
      };
    },

    async listGmail(accessToken: string) {
      const listResponse = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10", {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!listResponse.ok) {
        throw providerErrorFromStatus(listResponse.status, await listResponse.text());
      }
      const list = z.object({ messages: z.array(z.object({ id: z.string(), threadId: z.string().optional() })).optional() }).parse(await listResponse.json());
      const messages = [];
      for (const item of list.messages ?? []) {
        const response = await fetchImpl(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=To`,
          { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20_000) },
        );
        if (!response.ok) {
          continue;
        }
        const parsed = z
          .object({
            id: z.string(),
            threadId: z.string().optional(),
            snippet: z.string().optional(),
            payload: z
              .object({ headers: z.array(z.object({ name: z.string(), value: z.string() })).optional() })
              .optional(),
          })
          .parse(await response.json());
        const header = (name: string) => parsed.payload?.headers?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.value ?? "";
        messages.push({
          providerMessageId: parsed.id,
          providerThreadId: parsed.threadId ?? item.threadId ?? parsed.id,
          subject: header("Subject"),
          from: header("From"),
          to: header("To"),
          snippet: parsed.snippet ?? "",
        });
      }
      return messages;
    },

    async listMicrosoft(accessToken: string) {
      const response = await fetchImpl("https://graph.microsoft.com/v1.0/me/messages?$top=10&$select=id,conversationId,subject,bodyPreview,from,toRecipients,isDraft", {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, await response.text());
      }
      const parsed = z
        .object({
          value: z.array(
            z.object({
              id: z.string(),
              conversationId: z.string().optional(),
              subject: z.string().optional(),
              bodyPreview: z.string().optional(),
              isDraft: z.boolean().optional(),
              from: z.object({ emailAddress: z.object({ address: z.string().optional() }).optional() }).optional(),
              toRecipients: z.array(z.object({ emailAddress: z.object({ address: z.string().optional() }).optional() })).optional(),
            }),
          ),
        })
        .parse(await response.json());
      return parsed.value
        .filter((message) => !message.isDraft)
        .map((message) => ({
          providerMessageId: message.id,
          providerThreadId: message.conversationId ?? message.id,
          subject: message.subject ?? "",
          from: message.from?.emailAddress?.address ?? "",
          to: message.toRecipients?.[0]?.emailAddress?.address ?? "",
          snippet: message.bodyPreview ?? "",
        }));
    },

    async sendResend(apiKey: string, input: { from: string; to: string; subject: string; body: string }): Promise<MailAccepted> {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, text: input.body }),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, text);
      }
      const parsed = resendSchema.parse(JSON.parse(text) as unknown);
      return {
        deliveryState: deliveryFromProvider({ httpStatus: response.status }) as "accepted",
        providerMessageId: parsed.id,
        providerThreadId: null,
        providerResponse: { id: parsed.id },
      };
    },
  };
}

export function classifySendError(error: unknown): { kind: "retry" | "reconcile" | "fail"; message: string; providerMessageId?: string } {
  if (error instanceof ProviderRequestError) {
    const status = error.code === "timeout" ? "timeout" : error.code === "rate_limited" ? 429 : error.code === "PROVIDER_ERROR" ? 503 : 400;
    return {
      kind: sendFailureKind(status),
      message: error.message,
      providerMessageId: (error as ProviderRequestError & { providerMessageId?: string }).providerMessageId,
    };
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return { kind: "reconcile", message: "The provider request timed out." };
  }
  return { kind: "fail", message: error instanceof Error ? error.message : "Send failed." };
}

export function acceptedState(): DeliveryState {
  return "accepted";
}

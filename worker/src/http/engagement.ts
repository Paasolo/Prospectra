import type { IncomingMessage, ServerResponse } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ASSISTANT_LIMITS,
  CREDIT_COSTS,
  EMAIL_GENERATION_SYSTEM_PROMPT,
  INBOX_REPLY_SYSTEM_PROMPT,
  activationBlockers,
  assistantOutputJsonSchema,
  assistantOutputSchema,
  assistantRequestKey,
  buildAssistantMessages,
  createRateLimiter,
  emailDraftInputSchema,
  emailGenerationJsonSchema,
  emailGenerationSchema,
  enrollmentBlockers,
  inboxMessageKey,
  meetingInputSchema,
  meetingWindowError,
  proposeSlots,
  providerConfigurationState,
  replySuggestionJsonSchema,
  replySuggestionSchema,
  separateFacts,
  unsupportedPersonalClaims,
  type EvidenceBlock,
} from "@prospectra/shared";
import { z } from "zod";
import { createStructuredCompletion } from "../ai/openai.js";
import { createCalendarClient } from "../calendar/provider.js";
import { processDueOutreach } from "../campaigns/process.js";
import type { WorkerConfig } from "../config.js";
import { decryptJson, encryptJson, readState, signState, type StoredTokens } from "../credentials/crypto.js";
import { createMailbox, googleAuthUrl, microsoftAuthUrl } from "../email/mailbox.js";
import { clientSafeError, HttpError } from "./errors.js";

const uuid = z.string().uuid();
const assistantLimiter = createRateLimiter(ASSISTANT_LIMITS.requestsPerMinute, 60_000);
const generationLimiter = createRateLimiter(8, 60_000);

type PublicInput = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: WorkerConfig;
  admin: SupabaseClient | null;
  cors: Record<string, string>;
};

type MemberInput = PublicInput & {
  admin: SupabaseClient;
  userId: string;
  body: unknown;
  send: (status: number, body: unknown) => void;
};

function requireReady(config: WorkerConfig, provider: "gmail" | "microsoft", kind: "email" | "calendar") {
  if (!config.credentialKey || !config.publicUrl || !config.appUrl) {
    throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Set WORKER_CREDENTIAL_KEY, WORKER_PUBLIC_URL, and APP_URL before connecting an account.");
  }
  const clientId = provider === "gmail"
    ? kind === "calendar" ? config.googleCalendarClientId : config.googleClientId
    : kind === "calendar" ? config.microsoftCalendarClientId : config.microsoftClientId;
  const clientSecret = provider === "gmail"
    ? kind === "calendar" ? config.googleCalendarClientSecret : config.googleClientSecret
    : kind === "calendar" ? config.microsoftCalendarClientSecret : config.microsoftClientSecret;
  const state = providerConfigurationState({ clientId, clientSecret });
  if (state !== "configured" || !clientId || !clientSecret) {
    throw new HttpError(503, "PROVIDER_UNCONFIGURED", `${provider} OAuth is ${state}. Add the client id and secret on the worker.`);
  }
  return { clientId, clientSecret, redirectUri: `${config.publicUrl.replace(/\/$/, "")}/v1/email/oauth/callback` };
}

async function requireMember(admin: SupabaseClient, workspaceId: string, userId: string) {
  const { data, error } = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) {
    throw new HttpError(500, "INTERNAL", error.message);
  }
  if (!data) {
    throw new HttpError(403, "FORBIDDEN", "You are not a member of this workspace.");
  }
}

async function logUsage(admin: SupabaseClient, row: Record<string, unknown>) {
  await admin.from("ai_usage_log").insert(row);
}

export async function handlePublicEngagement(input: PublicInput): Promise<boolean> {
  const { req, res, url, config, admin, cors } = input;
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", ...cors });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "GET" && url.pathname === "/v1/email/webhooks/microsoft") {
      const token = url.searchParams.get("validationToken");
      if (!token) {
        send(400, { code: "VALIDATION_FAILED", message: "Microsoft webhook validation is missing a token." });
        return true;
      }
      res.writeHead(200, { "content-type": "text/plain", ...cors });
      res.end(token);
      return true;
    }
    if (req.method === "POST" && url.pathname === "/v1/email/webhooks/microsoft") {
      if (!config.webhookSecret) {
        send(503, { code: "PROVIDER_UNCONFIGURED", message: "WORKER_WEBHOOK_SECRET is not configured. Unsigned notifications are ignored." });
        return true;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as { value?: Array<{ clientState?: string }> };
      const valid = (payload.value ?? []).every((notice) => notice.clientState === config.webhookSecret);
      if (!valid) {
        send(401, { code: "FORBIDDEN", message: "The webhook client state did not match." });
        return true;
      }
      send(202, { accepted: true, action: "sync_required" });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/v1/email/oauth/callback") {
      if (!admin || !config.credentialKey || !config.appUrl) {
        send(503, { code: "PROVIDER_UNCONFIGURED", message: "OAuth callback storage is not configured." });
        return true;
      }
      const destination = await finishOAuth(config, admin, url);
      res.writeHead(302, { location: destination, ...cors });
      res.end();
      return true;
    }
  } catch (error) {
    const http = clientSafeError(error);
    if (config.appUrl && url.pathname.endsWith("/callback")) {
      res.writeHead(302, { location: `${config.appUrl}/app/integrations?error=${encodeURIComponent(http.message)}` });
      res.end();
      return true;
    }
    send(http.statusCode, { code: http.code, message: http.message });
    return true;
  }
  return false;
}

async function finishOAuth(config: WorkerConfig, admin: SupabaseClient, url: URL): Promise<string> {
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  if (!code || !stateToken || !config.credentialKey || !config.appUrl) {
    throw new HttpError(400, "VALIDATION_FAILED", "The OAuth callback is missing a code or state.");
  }
  const state = readState(stateToken, config.credentialKey);
  const ready = requireReady(config, state.provider, state.kind);
  const mailbox = createMailbox();
  const tokens = state.provider === "gmail"
    ? await mailbox.exchangeGoogleCode({ ...ready, code })
    : await mailbox.exchangeMicrosoftCode({ ...ready, code });
  const profile = await providerIdentity(state.provider, tokens.access_token);
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
  const stored: StoredTokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? "",
    expiresAt,
  };
  if (!stored.refreshToken) {
    throw new HttpError(502, "PROVIDER_ERROR", "The provider did not return a refresh token. Reconnect and grant offline access.");
  }
  const { data: account, error } = await admin
    .from("connected_accounts")
    .insert({
      workspace_id: state.workspaceId,
      kind: state.kind,
      provider: state.provider,
      email_address: profile.email,
      sending_identity: profile.email,
      status: "connected",
      created_by: state.userId,
      token_expires_at: expiresAt,
      health: { checkedAt: new Date().toISOString(), state: "connected" },
    })
    .select("id")
    .single();
  if (error || !account) {
    throw new HttpError(500, "INTERNAL", error?.message ?? "The connected account could not be stored.");
  }
  const { error: secretError } = await admin.from("integration_secrets").insert({
    workspace_id: state.workspaceId,
    account_id: account.id,
    ciphertext: encryptJson(stored, config.credentialKey),
  });
  if (secretError) {
    throw new HttpError(500, "INTERNAL", secretError.message);
  }
  return `${config.appUrl}/app/integrations?connected=${state.provider}`;
}

async function providerIdentity(provider: "gmail" | "microsoft", accessToken: string): Promise<{ email: string }> {
  const response = await fetch(provider === "gmail" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new HttpError(502, "PROVIDER_ERROR", "The provider did not return the account identity.");
  }
  const body = (await response.json()) as { email?: string; mail?: string; userPrincipalName?: string };
  const email = body.email || body.mail || body.userPrincipalName;
  if (!email) {
    throw new HttpError(502, "PROVIDER_ERROR", "The provider account has no email address.");
  }
  return { email };
}

export async function handleMemberEngagement(input: MemberInput): Promise<boolean> {
  const path = input.url.pathname;
  const known = [
    "/v1/assistant/messages",
    "/v1/email/generate",
    "/v1/email/oauth/start",
    "/v1/email/disconnect",
    "/v1/email/test",
    "/v1/email/resend",
    "/v1/inbox/sync",
    "/v1/inbox/suggest",
    "/v1/inbox/reply",
    "/v1/campaigns/activate",
    "/v1/campaigns/status",
    "/v1/outreach/process",
    "/v1/calendar/availability",
    "/v1/calendar/meetings",
    "/v1/calendar/meetings/reschedule",
    "/v1/calendar/meetings/cancel",
  ];
  if (!known.includes(path)) {
    return false;
  }
  const workspaceId = uuid.parse((input.body as { workspaceId?: string }).workspaceId);
  await requireMember(input.admin, workspaceId, input.userId);
  if (path === "/v1/assistant/messages") {
    await assistantMessage(input, workspaceId);
    return true;
  }
  if (path === "/v1/email/generate") {
    input.send(200, await generateEmail(input, workspaceId));
    return true;
  }
  if (path === "/v1/email/oauth/start") {
    input.send(200, startOAuth(input, workspaceId));
    return true;
  }
  if (path === "/v1/email/disconnect") {
    input.send(200, await disconnectAccount(input, workspaceId));
    return true;
  }
  if (path === "/v1/email/test") {
    input.send(200, await sendTest(input, workspaceId));
    return true;
  }
  if (path === "/v1/email/resend") {
    input.send(200, await connectResend(input, workspaceId));
    return true;
  }
  if (path === "/v1/inbox/sync") {
    input.send(200, await syncInbox(input, workspaceId));
    return true;
  }
  if (path === "/v1/inbox/suggest") {
    input.send(200, await suggestReply(input, workspaceId));
    return true;
  }
  if (path === "/v1/inbox/reply") {
    input.send(200, await sendReply(input, workspaceId));
    return true;
  }
  if (path === "/v1/campaigns/activate") {
    input.send(200, await activateCampaign(input, workspaceId));
    return true;
  }
  if (path === "/v1/campaigns/status") {
    input.send(200, await setCampaignStatus(input, workspaceId));
    return true;
  }
  if (path === "/v1/outreach/process") {
    input.send(200, await processDueOutreach(input.admin, input.config));
    return true;
  }
  if (path === "/v1/calendar/availability") {
    input.send(200, await availability(input, workspaceId));
    return true;
  }
  if (path === "/v1/calendar/meetings") {
    input.send(200, await createMeeting(input, workspaceId));
    return true;
  }
  if (path === "/v1/calendar/meetings/reschedule") {
    input.send(200, await rescheduleMeeting(input, workspaceId));
    return true;
  }
  if (path === "/v1/calendar/meetings/cancel") {
    input.send(200, await cancelMeeting(input, workspaceId));
    return true;
  }
  return false;
}

function startOAuth(input: MemberInput, workspaceId: string) {
  const body = z.object({ provider: z.enum(["gmail", "microsoft"]), kind: z.enum(["email", "calendar"]) }).parse(input.body);
  const ready = requireReady(input.config, body.provider, body.kind);
  const state = signState({ workspaceId, userId: input.userId, provider: body.provider, kind: body.kind }, input.config.credentialKey!);
  const url = body.provider === "gmail" ? googleAuthUrl({ ...ready, state, kind: body.kind }) : microsoftAuthUrl({ ...ready, state, kind: body.kind });
  return { url };
}

async function consume(admin: SupabaseClient, workspaceId: string, amount: number, reason: string, referenceId: string, actor: string) {
  const { error } = await admin.rpc("consume_workspace_credits", {
    p_workspace_id: workspaceId,
    p_amount: amount,
    p_reason: reason,
    p_reference_type: reason,
    p_reference_id: referenceId,
    p_actor: actor,
  });
  if (error) {
    if (error.message.toLowerCase().includes("insufficient")) {
      throw new HttpError(402, "CREDIT_INSUFFICIENT", "The workspace does not have enough credits.");
    }
    throw new HttpError(500, "INTERNAL", error.message);
  }
}

async function refund(admin: SupabaseClient, workspaceId: string, amount: number, reason: string, referenceId: string, actor: string) {
  await admin.rpc("grant_workspace_credits", {
    p_workspace_id: workspaceId,
    p_amount: amount,
    p_reason: reason,
    p_reference_type: reason,
    p_reference_id: referenceId,
    p_actor: actor,
  });
}

function rowText(label: string, row: Record<string, unknown> | null): string {
  if (!row) {
    return "";
  }
  return Object.entries(row)
    .filter(([key, value]) => value != null && !["workspace_id", "metadata", "criteria"].includes(key))
    .map(([key, value]) => `${label}.${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

async function loadEvidence(admin: SupabaseClient, workspaceId: string, contextValue: unknown): Promise<EvidenceBlock[]> {
  const context = z
    .object({
      prospectId: uuid.nullable().optional(),
      companyId: uuid.nullable().optional(),
      icpId: uuid.nullable().optional(),
      campaignId: uuid.nullable().optional(),
      previousConversationId: uuid.nullable().optional(),
    })
    .parse(contextValue ?? {});
  const blocks: EvidenceBlock[] = [];
  const load = async (table: string, id: string | null | undefined, label: string) => {
    if (!id) {
      return;
    }
    const { data, error } = await admin.from(table).select("*").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
    if (error) {
      throw new HttpError(500, "INTERNAL", error.message);
    }
    if (!data) {
      throw new HttpError(404, "NOT_FOUND", `${label} was not found in this workspace.`);
    }
    blocks.push({ id: `${label}:${id}`, label, text: rowText(label, data as Record<string, unknown>) });
  };
  await load("prospects", context.prospectId, "prospect");
  await load("companies", context.companyId, "company");
  await load("icp_profiles", context.icpId, "icp");
  await load("campaigns", context.campaignId, "campaign");
  if (context.previousConversationId) {
    const { data: prior } = await admin.from("ai_conversations").select("id").eq("id", context.previousConversationId).eq("workspace_id", workspaceId).maybeSingle();
    if (!prior) {
      throw new HttpError(404, "NOT_FOUND", "The previous conversation was not found in this workspace.");
    }
    const { data: messages } = await admin.from("ai_messages").select("role, content").eq("conversation_id", prior.id).order("created_at", { ascending: true }).limit(8);
    blocks.push({
      id: `conversation:${prior.id}`,
      label: "previous conversation",
      text: (messages ?? []).map((message) => `${message.role}: ${message.content}`).join("\n"),
    });
  }
  return blocks;
}

async function assistantMessage(input: MemberInput, workspaceId: string) {
  const body = z.object({ conversationId: uuid, content: z.string().trim().min(1).max(4000), stream: z.boolean().optional() }).parse(input.body);
  const limit = assistantLimiter.check(`${input.userId}:assistant`);
  if (!limit.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Too many assistant requests. Try again shortly.");
  }
  if (!input.config.openaiApiKey) {
    throw new HttpError(503, "PROVIDER_UNCONFIGURED", "OpenAI is not configured on the worker.");
  }
  const { data: conversation } = await input.admin.from("ai_conversations").select("*").eq("id", body.conversationId).eq("workspace_id", workspaceId).maybeSingle();
  if (!conversation) {
    throw new HttpError(404, "NOT_FOUND", "Conversation not found.");
  }
  const evidence = await loadEvidence(input.admin, workspaceId, conversation.context);
  const key = assistantRequestKey({ conversationId: body.conversationId, content: body.content, sourceIds: evidence.map((block) => block.id) });
  const { data: existing } = await input.admin
    .from("ai_messages")
    .select("id, content, structured, model, usage")
    .eq("conversation_id", body.conversationId)
    .eq("request_key", key)
    .eq("role", "assistant")
    .eq("status", "succeeded")
    .maybeSingle();
  if (existing?.structured) {
    input.send(200, { deduplicated: true, messageId: existing.id, output: assistantOutputSchema.parse(existing.structured), model: existing.model, usage: existing.usage });
    return;
  }
  await consume(input.admin, workspaceId, CREDIT_COSTS.assistantMessage, "assistant_message", body.conversationId, input.userId);
  await input.admin.from("ai_messages").insert({
    workspace_id: workspaceId,
    conversation_id: body.conversationId,
    role: "user",
    content: body.content,
    status: "succeeded",
    request_key: key,
    created_by: input.userId,
  });
  const { data: history } = await input.admin.from("ai_messages").select("role, content").eq("conversation_id", body.conversationId).order("created_at", { ascending: true }).limit(12);
  try {
    if (body.stream) {
      input.res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", ...input.cors });
    }
    const result = await createStructuredCompletion({
      apiKey: input.config.openaiApiKey,
      model: input.config.openaiModel,
      schemaName: "sales_assistant",
      jsonSchema: assistantOutputJsonSchema,
      messages: buildAssistantMessages({
        instruction: body.content,
        evidence,
        history: (history ?? []).filter((message) => message.role === "user" || message.role === "assistant"),
      }),
      parse: (value) => assistantOutputSchema.parse(value),
      maxTokens: ASSISTANT_LIMITS.maxTokens,
      onDelta: body.stream
        ? (text) => {
            input.res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
          }
        : undefined,
    });
    const output = separateFacts(result.data, evidence);
    const { data: saved, error } = await input.admin
      .from("ai_messages")
      .insert({
        workspace_id: workspaceId,
        conversation_id: body.conversationId,
        role: "assistant",
        content: output.summary,
        structured: output,
        status: "succeeded",
        model: result.model,
        usage: result.usage,
        request_key: key,
      })
      .select("id")
      .single();
    if (error) {
      throw new HttpError(500, "INTERNAL", error.message);
    }
    await logUsage(input.admin, {
      workspace_id: workspaceId,
      user_id: input.userId,
      kind: "assistant",
      model: result.model,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      estimated_cost_usd: result.usage.estimatedCostUsd,
      status: "succeeded",
      request_key: key,
    });
    if (conversation.title === "New conversation") {
      await input.admin.from("ai_conversations").update({ title: body.content.slice(0, 80) }).eq("id", body.conversationId);
    }
    const payload = { deduplicated: false, messageId: saved.id, output, model: result.model, usage: result.usage };
    if (body.stream) {
      input.res.write(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
      input.res.end();
      return;
    }
    input.send(200, payload);
  } catch (error) {
    await refund(input.admin, workspaceId, CREDIT_COSTS.assistantMessage, "assistant_message_failed", body.conversationId, input.userId);
    const message = error instanceof Error ? error.message : "The assistant request failed.";
    await input.admin.from("ai_messages").insert({
      workspace_id: workspaceId,
      conversation_id: body.conversationId,
      role: "assistant",
      content: message,
      status: "failed",
      error_code: error instanceof HttpError ? error.code : "AI_OUTPUT_INVALID",
      error_detail: message,
      request_key: key,
    });
    await logUsage(input.admin, { workspace_id: workspaceId, user_id: input.userId, kind: "assistant", status: "failed", request_key: key });
    if (body.stream && input.res.headersSent) {
      input.res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      input.res.end();
      return;
    }
    throw error;
  }
}

async function generateEmail(input: MemberInput, workspaceId: string) {
  const parsed = z.object({ workspaceId: uuid }).and(emailDraftInputSchema).parse(input.body);
  const limit = generationLimiter.check(`${input.userId}:email`);
  if (!limit.ok) {
    throw new HttpError(429, "RATE_LIMITED", "Too many email generations. Try again shortly.");
  }
  if (!input.config.openaiApiKey) {
    throw new HttpError(503, "PROVIDER_UNCONFIGURED", "OpenAI is not configured on the worker.");
  }
  const evidence = await loadEvidence(input.admin, workspaceId, {
    prospectId: parsed.prospectId,
    companyId: parsed.companyId,
    icpId: parsed.icpId,
  });
  await consume(input.admin, workspaceId, CREDIT_COSTS.emailGeneration, "email_generation", workspaceId, input.userId);
  try {
    const result = await createStructuredCompletion({
      apiKey: input.config.openaiApiKey,
      model: input.config.openaiModel,
      schemaName: "sales_email",
      jsonSchema: emailGenerationJsonSchema,
      messages: [
        { role: "system", content: EMAIL_GENERATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `<untrusted_context>\n${evidence.map((block) => block.text).join("\n\n")}\n</untrusted_context>\nType: ${parsed.emailType}\nTone: ${parsed.tone}\nLength: ${parsed.length}\nObjective: ${parsed.objective}\nCTA: ${parsed.callToAction}\nInstructions: ${parsed.instructions}`,
        },
      ],
      parse: (value) => emailGenerationSchema.parse(value),
      maxTokens: 900,
    });
    const evidenceText = evidence.map((block) => block.text).join("\n");
    const warnings = unsupportedPersonalClaims(`${result.data.subject}\n${result.data.body}`, evidenceText);
    await logUsage(input.admin, {
      workspace_id: workspaceId,
      user_id: input.userId,
      kind: "email_generation",
      model: result.model,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      estimated_cost_usd: result.usage.estimatedCostUsd,
      status: "succeeded",
    });
    if (parsed.prospectId) {
      await input.admin.from("prospect_activities").insert({
        workspace_id: workspaceId,
        prospect_id: parsed.prospectId,
        activity_type: "email_generated",
        summary: "A sales email draft was generated.",
        actor_user_id: input.userId,
      });
    }
    return { draft: result.data, warnings, model: result.model, usage: result.usage };
  } catch (error) {
    await refund(input.admin, workspaceId, CREDIT_COSTS.emailGeneration, "email_generation_failed", workspaceId, input.userId);
    throw error;
  }
}

async function accessTokenFor(input: MemberInput, account: { id: string; provider: string; kind?: string }) {
  if (account.provider === "resend") {
    if (!input.config.resendApiKey) {
      throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Resend is not configured on the worker.");
    }
    return null;
  }
  if (!input.config.credentialKey) {
    throw new HttpError(503, "PROVIDER_UNCONFIGURED", "WORKER_CREDENTIAL_KEY is not configured.");
  }
  const { data } = await input.admin.from("integration_secrets").select("ciphertext").eq("account_id", account.id).maybeSingle();
  if (!data?.ciphertext) {
    throw new HttpError(409, "PROVIDER_UNCONFIGURED", "This account has no stored credentials.");
  }
  const tokens = decryptJson(String(data.ciphertext), input.config.credentialKey) as StoredTokens;
  const mailbox = createMailbox();
  const provider = account.provider === "gmail" ? "gmail" : "microsoft";
  const ready = requireReady(input.config, provider, account.kind === "calendar" ? "calendar" : "email");
  if (account.provider === "gmail") {
    const refreshed = await mailbox.refreshGoogle({ ...ready, refreshToken: tokens.refreshToken });
    return refreshed.access_token;
  }
  const refreshed = await mailbox.refreshMicrosoft({ ...ready, refreshToken: tokens.refreshToken });
  return refreshed.access_token;
}

async function disconnectAccount(input: MemberInput, workspaceId: string) {
  const body = z.object({ accountId: uuid }).parse(input.body);
  const { data: account } = await input.admin.from("connected_accounts").select("*").eq("id", body.accountId).eq("workspace_id", workspaceId).maybeSingle();
  if (!account) {
    throw new HttpError(404, "NOT_FOUND", "Account not found.");
  }
  let providerRevocation: "confirmed" | "unconfirmed" | "not_applicable" = "not_applicable";
  if (account.provider === "gmail" && input.config.credentialKey) {
    const { data: secret } = await input.admin.from("integration_secrets").select("ciphertext").eq("account_id", account.id).maybeSingle();
    if (secret?.ciphertext) {
      const tokens = decryptJson(String(secret.ciphertext), input.config.credentialKey) as StoredTokens;
      providerRevocation = (await createMailbox().revokeGoogle(tokens.refreshToken)) ? "confirmed" : "unconfirmed";
    }
  }
  if (account.provider === "microsoft") {
    providerRevocation = "unconfirmed";
  }
  await input.admin.from("integration_secrets").delete().eq("account_id", account.id);
  await input.admin.from("connected_accounts").update({ status: "disconnected", token_expires_at: null, last_error: null }).eq("id", account.id);
  await input.admin.from("notifications").insert({
    workspace_id: workspaceId,
    user_id: input.userId,
    type: "integration_disconnected",
    title: "Integration disconnected",
    body: `${account.provider} was disconnected.`,
  });
  return { disconnected: true, providerRevocation };
}

async function connectResend(input: MemberInput, workspaceId: string) {
  const body = z.object({ fromAddress: z.string().email() }).parse(input.body);
  if (!input.config.resendApiKey) {
    throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Set EMAIL_PROVIDER_API_KEY on the worker to use Resend.");
  }
  const { data, error } = await input.admin
    .from("connected_accounts")
    .insert({
      workspace_id: workspaceId,
      kind: "email",
      provider: "resend",
      email_address: body.fromAddress,
      sending_identity: body.fromAddress,
      status: "connected",
      created_by: input.userId,
      health: { state: "configured", checkedAt: new Date().toISOString() },
    })
    .select("id, provider, email_address, status")
    .single();
  if (error) {
    throw new HttpError(500, "INTERNAL", error.message);
  }
  return { account: data };
}

async function sendTest(input: MemberInput, workspaceId: string) {
  const body = z.object({
    accountId: uuid,
    to: z.string().email(),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(8000),
  }).parse(input.body);
  if (unsupportedPersonalClaims(body.body, "").length > 0) {
    throw new HttpError(400, "VALIDATION_FAILED", "Remove unsupported relationship claims before sending a test.");
  }
  const { data: account } = await input.admin.from("connected_accounts").select("*").eq("id", body.accountId).eq("workspace_id", workspaceId).eq("kind", "email").maybeSingle();
  if (!account || account.status !== "connected") {
    throw new HttpError(409, "PROVIDER_UNCONFIGURED", "Connect a sending account before sending a test.");
  }
  const mailbox = createMailbox();
  const from = account.sending_identity || account.email_address;
  const message = { from, to: body.to, subject: body.subject, body: body.body };
  const token = await accessTokenFor(input, account);
  const accepted = account.provider === "resend"
    ? await mailbox.sendResend(input.config.resendApiKey!, message)
    : account.provider === "gmail"
      ? await mailbox.sendGmail(token!, [`From: ${from}`, `To: ${body.to}`, `Subject: ${body.subject}`, "", body.body].join("\r\n"))
      : await mailbox.sendMicrosoft(token!, message);
  await input.admin.from("email_messages").insert({
    workspace_id: workspaceId,
    direction: "outbound",
    provider: account.provider,
    provider_status: "accepted",
    delivery_state: "accepted",
    subject: body.subject,
    body: body.body,
    recipient: body.to,
    sending_account_id: account.id,
    provider_message_id: accepted.providerMessageId,
    provider_thread_id: accepted.providerThreadId,
    attempted_at: new Date().toISOString(),
    provider_response: accepted.providerResponse,
  });
  return { deliveryState: "accepted" as const, providerMessageId: accepted.providerMessageId, delivered: false };
}

async function syncInbox(input: MemberInput, workspaceId: string) {
  const { data: accounts } = await input.admin.from("connected_accounts").select("*").eq("workspace_id", workspaceId).eq("kind", "email").eq("status", "connected");
  if (!accounts?.length) {
    throw new HttpError(409, "PROVIDER_UNCONFIGURED", "Connect Gmail or Microsoft 365 before syncing the inbox.");
  }
  const mailbox = createMailbox();
  let inserted = 0;
  const duplicates: string[] = [];
  for (const account of accounts) {
    if (account.provider === "resend") {
      continue;
    }
    const token = await accessTokenFor(input, account);
    const messages = account.provider === "gmail" ? await mailbox.listGmail(token!) : await mailbox.listMicrosoft(token!);
    for (const message of messages) {
      const key = inboxMessageKey(account.provider, message.providerMessageId);
      const { data: existing } = await input.admin
        .from("email_messages")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("provider", account.provider)
        .eq("provider_message_id", message.providerMessageId)
        .maybeSingle();
      if (existing) {
        duplicates.push(key);
        continue;
      }
      const { data: conversation } = await input.admin
        .from("inbox_conversations")
        .upsert(
          {
            workspace_id: workspaceId,
            provider: account.provider,
            provider_thread_id: message.providerThreadId,
            subject: message.subject,
            last_message_at: new Date().toISOString(),
            unread: true,
          },
          { onConflict: "workspace_id,provider,provider_thread_id" },
        )
        .select("id")
        .single();
      const ownAddress = String(account.email_address ?? "").toLowerCase();
      const inbound = !message.from.toLowerCase().includes(ownAddress);
      await input.admin.from("email_messages").insert({
        workspace_id: workspaceId,
        conversation_id: conversation?.id ?? null,
        direction: inbound ? "inbound" : "outbound",
        provider: account.provider,
        provider_message_id: message.providerMessageId,
        provider_thread_id: message.providerThreadId,
        subject: message.subject,
        body: message.snippet,
        recipient: message.to,
        delivery_state: inbound ? "delivered" : "accepted",
        provider_status: inbound ? "received" : "accepted",
        attempted_at: new Date().toISOString(),
      });
      inserted += 1;
      if (inbound) {
        await stopForReply(input.admin, workspaceId, message.from);
      }
    }
  }
  return { inserted, duplicates };
}

export async function syncWorkspaceInbox(admin: SupabaseClient, config: WorkerConfig, workspaceId: string) {
  return syncInbox({ admin, config } as MemberInput, workspaceId);
}

export async function syncWorkspaceCalendar(admin: SupabaseClient, config: WorkerConfig, workspaceId: string) {
  const input = { admin, config } as MemberInput;
  const { data: accounts } = await admin
    .from("connected_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("kind", "calendar")
    .eq("status", "connected");
  if (!accounts?.length) {
    throw new HttpError(409, "PROVIDER_UNCONFIGURED", "Connect Google Calendar or Microsoft calendar before synchronising.");
  }
  const calendar = createCalendarClient();
  const start = new Date();
  const end = new Date(start.getTime() + 86_400_000);
  let busy = 0;
  for (const account of accounts) {
    const token = await accessTokenFor(input, account);
    const intervals = account.provider === "gmail"
      ? await calendar.googleBusy(token!, {
          calendarId: account.selected_calendar_id || "primary",
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
        })
      : await calendar.microsoftBusy(token!, {
          email: account.email_address,
          start: start.toISOString(),
          end: end.toISOString(),
          timeZone: account.timezone || "UTC",
        });
    busy += intervals.length;
  }
  await admin.from("usage_records").insert({
    workspace_id: workspaceId,
    metric: "calendar_busy_intervals",
    quantity: busy,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    metadata: { accounts: accounts.length },
  });
  return { accounts: accounts.length, busyIntervals: busy };
}

async function stopForReply(admin: SupabaseClient, workspaceId: string, from: string) {
  const email = from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
  if (!email) {
    return;
  }
  const { data: prospects } = await admin.from("prospects").select("id").eq("workspace_id", workspaceId).eq("normalized_email", email);
  for (const prospect of prospects ?? []) {
    await admin.from("campaign_enrollments").update({ status: "stopped", stop_reason: "reply" }).eq("workspace_id", workspaceId).eq("prospect_id", prospect.id).eq("status", "active");
    await admin.from("prospect_activities").insert({
      workspace_id: workspaceId,
      prospect_id: prospect.id,
      activity_type: "email_response_received",
      summary: "An inbound message stopped the active sequence.",
    });
  }
}

async function suggestReply(input: MemberInput, workspaceId: string) {
  const body = z.object({ conversationId: uuid }).parse(input.body);
  if (!input.config.openaiApiKey) {
    throw new HttpError(503, "PROVIDER_UNCONFIGURED", "OpenAI is not configured on the worker.");
  }
  const { data: messages } = await input.admin.from("email_messages").select("direction, subject, body, created_at").eq("workspace_id", workspaceId).eq("conversation_id", body.conversationId).order("created_at", { ascending: true }).limit(20);
  if (!messages?.length) {
    throw new HttpError(404, "NOT_FOUND", "Conversation not found.");
  }
  await consume(input.admin, workspaceId, CREDIT_COSTS.assistantMessage, "inbox_suggestion", body.conversationId, input.userId);
  try {
    const result = await createStructuredCompletion({
      apiKey: input.config.openaiApiKey,
      model: input.config.openaiModel,
      schemaName: "inbox_reply",
      jsonSchema: replySuggestionJsonSchema,
      messages: [
        { role: "system", content: INBOX_REPLY_SYSTEM_PROMPT },
        { role: "user", content: `<untrusted_context>\n${messages.map((message) => `${message.direction}: ${message.subject ?? ""}\n${message.body ?? ""}`).join("\n\n")}\n</untrusted_context>` },
      ],
      parse: (value) => replySuggestionSchema.parse(value),
      maxTokens: 800,
    });
    await logUsage(input.admin, {
      workspace_id: workspaceId,
      user_id: input.userId,
      kind: "inbox_suggestion",
      model: result.model,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      estimated_cost_usd: result.usage.estimatedCostUsd,
      status: "succeeded",
    });
    return { suggestion: result.data, requiresApproval: true, model: result.model, usage: result.usage };
  } catch (error) {
    await refund(input.admin, workspaceId, CREDIT_COSTS.assistantMessage, "inbox_suggestion_failed", body.conversationId, input.userId);
    throw error;
  }
}

async function sendReply(input: MemberInput, workspaceId: string) {
  const body = z.object({ conversationId: uuid, accountId: uuid, to: z.string().email(), subject: z.string().min(1).max(200), body: z.string().min(1).max(8000) }).parse(input.body);
  const { data: account } = await input.admin.from("connected_accounts").select("*").eq("id", body.accountId).eq("workspace_id", workspaceId).eq("status", "connected").maybeSingle();
  if (!account) {
    throw new HttpError(409, "PROVIDER_UNCONFIGURED", "Choose a connected sending account.");
  }
  const token = await accessTokenFor(input, account);
  const mailbox = createMailbox();
  const from = account.sending_identity || account.email_address;
  const accepted = account.provider === "gmail"
    ? await mailbox.sendGmail(token!, [`From: ${from}`, `To: ${body.to}`, `Subject: ${body.subject}`, "", body.body].join("\r\n"))
    : account.provider === "microsoft"
      ? await mailbox.sendMicrosoft(token!, { from, to: body.to, subject: body.subject, body: body.body })
      : await mailbox.sendResend(input.config.resendApiKey!, { from, to: body.to, subject: body.subject, body: body.body });
  await input.admin.from("email_messages").insert({
    workspace_id: workspaceId,
    conversation_id: body.conversationId,
    direction: "outbound",
    provider: account.provider,
    delivery_state: "accepted",
    provider_status: "accepted",
    subject: body.subject,
    body: body.body,
    recipient: body.to,
    sending_account_id: account.id,
    provider_message_id: accepted.providerMessageId,
    provider_thread_id: accepted.providerThreadId,
    attempted_at: new Date().toISOString(),
    provider_response: accepted.providerResponse,
  });
  return { deliveryState: "accepted" as const, providerMessageId: accepted.providerMessageId, delivered: false };
}

async function activateCampaign(input: MemberInput, workspaceId: string) {
  const body = z.object({ campaignId: uuid }).parse(input.body);
  const { data: campaign } = await input.admin.from("campaigns").select("*").eq("id", body.campaignId).eq("workspace_id", workspaceId).maybeSingle();
  if (!campaign) {
    throw new HttpError(404, "NOT_FOUND", "Campaign not found.");
  }
  const { data: steps } = await input.admin.from("campaign_steps").select("*").eq("campaign_id", campaign.id).order("position", { ascending: true });
  const { data: account } = await input.admin.from("connected_accounts").select("*").eq("id", campaign.sending_account_id ?? "").eq("workspace_id", workspaceId).maybeSingle();
  const ids = new Set<string>(campaign.audience_ids ?? []);
  if (campaign.list_id) {
    const { data: members } = await input.admin.from("prospect_list_members").select("prospect_id").eq("list_id", campaign.list_id);
    for (const member of members ?? []) {
      ids.add(member.prospect_id);
    }
  }
  const blockers = activationBlockers({
    name: campaign.name ?? "",
    objective: campaign.objective ?? "",
    steps: (steps ?? []).map((step) => ({ subject: step.subject, body: step.body })),
    accountConnected: account?.status === "connected",
    audienceCount: ids.size,
    dailyLimit: campaign.daily_limit ?? 0,
    timeZone: campaign.timezone ?? "UTC",
  });
  if (blockers.length > 0) {
    throw new HttpError(400, "VALIDATION_FAILED", blockers.join(" "));
  }
  const enrolled: string[] = [];
  const skipped: Array<{ prospectId: string; reasons: string[] }> = [];
  for (const prospectId of ids) {
    const { data: prospect } = await input.admin.from("prospects").select("id, email, normalized_email").eq("id", prospectId).eq("workspace_id", workspaceId).maybeSingle();
    const email = prospect?.normalized_email || prospect?.email || null;
    const { data: suppression } = email
      ? await input.admin.from("suppressions").select("id").eq("workspace_id", workspaceId).eq("email", email.toLowerCase()).maybeSingle()
      : { data: null };
    const { data: duplicate } = await input.admin.from("campaign_enrollments").select("id").eq("campaign_id", campaign.id).eq("prospect_id", prospectId).maybeSingle();
    const reasons = enrollmentBlockers({
      email,
      suppressed: Boolean(suppression),
      duplicate: Boolean(duplicate),
      accountConnected: true,
      steps: steps?.length ?? 0,
    });
    if (!prospect || reasons.length > 0) {
      skipped.push({ prospectId, reasons: prospect ? reasons : ["Prospect was not found in this workspace."] });
      continue;
    }
    enrolled.push(prospectId);
  }
  if (enrolled.length === 0) {
    throw new HttpError(400, "VALIDATION_FAILED", "No eligible prospects could be enrolled.");
  }
  const credits = enrolled.length * (steps?.length ?? 1) * CREDIT_COSTS.emailSend;
  await consume(input.admin, workspaceId, credits, "campaign_enrollment", campaign.id, input.userId);
  const status = campaign.scheduled_for && Date.parse(campaign.scheduled_for) > Date.now() ? "SCHEDULED" : "ACTIVE";
  for (const prospectId of enrolled) {
    const { data: enrollment, error } = await input.admin
      .from("campaign_enrollments")
      .insert({ workspace_id: workspaceId, campaign_id: campaign.id, prospect_id: prospectId, status: "active" })
      .select("id")
      .single();
    if (error || !enrollment) {
      continue;
    }
    await input.admin.from("outreach_jobs").insert({
      workspace_id: workspaceId,
      campaign_id: campaign.id,
      enrollment_id: enrollment.id,
      step_position: steps?.[0]?.position ?? 1,
      run_at: status === "SCHEDULED" ? campaign.scheduled_for : new Date().toISOString(),
      idempotency_key: `${enrollment.id}:${steps?.[0]?.position ?? 1}`,
    });
    await input.admin.from("prospect_activities").insert({
      workspace_id: workspaceId,
      prospect_id: prospectId,
      activity_type: "campaign_enrollment",
      summary: `Enrolled in ${campaign.name}.`,
      actor_user_id: input.userId,
    });
  }
  await input.admin.from("campaigns").update({ status, activated_at: status === "ACTIVE" ? new Date().toISOString() : null }).eq("id", campaign.id);
  return { status, enrolled: enrolled.length, skipped, reservedCredits: credits };
}

async function setCampaignStatus(input: MemberInput, workspaceId: string) {
  const body = z.object({ campaignId: uuid, status: z.enum(["PAUSED", "ACTIVE", "CANCELLED"]) }).parse(input.body);
  const { data: campaign } = await input.admin.from("campaigns").select("id, status").eq("id", body.campaignId).eq("workspace_id", workspaceId).maybeSingle();
  if (!campaign) {
    throw new HttpError(404, "NOT_FOUND", "Campaign not found.");
  }
  await input.admin.from("campaigns").update({ status: body.status }).eq("id", campaign.id);
  if (body.status === "CANCELLED") {
    const { data: jobs } = await input.admin.from("outreach_jobs").select("id").eq("campaign_id", campaign.id).in("status", ["pending", "needs_reconciliation"]);
    await input.admin.from("outreach_jobs").update({ status: "failed", last_error: "Campaign cancelled." }).eq("campaign_id", campaign.id).in("status", ["pending", "needs_reconciliation"]);
    await input.admin.from("campaign_enrollments").update({ status: "stopped", stop_reason: "cancelled" }).eq("campaign_id", campaign.id).eq("status", "active");
    if (jobs?.length) {
      await refund(input.admin, workspaceId, jobs.length * CREDIT_COSTS.emailSend, "campaign_cancelled", campaign.id, input.userId);
    }
  }
  return { status: body.status };
}

async function availability(input: MemberInput, workspaceId: string) {
  const body = z.object({
    accountId: uuid,
    rangeStart: z.string().datetime(),
    rangeEnd: z.string().datetime(),
    durationMinutes: z.number().int().min(15).max(240),
  }).parse(input.body);
  const { data: account } = await input.admin.from("connected_accounts").select("*").eq("id", body.accountId).eq("workspace_id", workspaceId).eq("kind", "calendar").eq("status", "connected").maybeSingle();
  if (!account) {
    throw new HttpError(409, "PROVIDER_UNCONFIGURED", "Connect Google Calendar or Microsoft calendar before checking availability.");
  }
  const token = await accessTokenFor(input, account);
  const calendar = createCalendarClient();
  const busy = account.provider === "gmail"
    ? await calendar.googleBusy(token!, { calendarId: account.selected_calendar_id || "primary", timeMin: body.rangeStart, timeMax: body.rangeEnd })
    : await calendar.microsoftBusy(token!, { email: account.email_address, start: body.rangeStart, end: body.rangeEnd, timeZone: account.timezone || "UTC" });
  const slots = proposeSlots({
    rangeStart: new Date(body.rangeStart),
    rangeEnd: new Date(body.rangeEnd),
    durationMinutes: body.durationMinutes,
    bufferMinutes: account.buffer_minutes ?? 15,
    timeZone: account.timezone || "UTC",
    workingStartMinutes: account.working_start_minutes ?? 540,
    workingEndMinutes: account.working_end_minutes ?? 1020,
    workingDays: account.working_days ?? [1, 2, 3, 4, 5],
    busy,
  });
  return { slots, source: account.provider, retrievedAt: new Date().toISOString() };
}

function eventBody(input: { title: string; description: string; startsAt: string; endsAt: string; timeZone: string; attendees: string[]; location: string }) {
  return {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startsAt, timeZone: input.timeZone },
    end: { dateTime: input.endsAt, timeZone: input.timeZone },
    attendees: input.attendees.map((email) => ({ email })),
  };
}

async function createMeeting(input: MemberInput, workspaceId: string) {
  const body = z.object({ workspaceId: uuid, accountId: uuid }).and(meetingInputSchema).parse(input.body);
  const windowError = meetingWindowError(body);
  if (windowError) {
    throw new HttpError(400, "VALIDATION_FAILED", windowError);
  }
  const { data: account } = await input.admin.from("connected_accounts").select("*").eq("id", body.accountId).eq("workspace_id", workspaceId).eq("kind", "calendar").eq("status", "connected").maybeSingle();
  if (!account) {
    throw new HttpError(409, "PROVIDER_UNCONFIGURED", "Connect a calendar before booking a meeting.");
  }
  const { data: meeting, error } = await input.admin
    .from("meetings")
    .insert({
      workspace_id: workspaceId,
      title: body.title,
      description: body.description,
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      timezone: body.timeZone,
      location: body.location,
      attendees: body.attendees,
      prospect_id: body.prospectId,
      company_id: body.companyId,
      conversation_id: body.conversationId,
      campaign_id: body.campaignId,
      provider: account.provider,
      connected_account_id: account.id,
      status: "pending",
      provider_confirmed: false,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !meeting) {
    throw new HttpError(500, "INTERNAL", error?.message ?? "The meeting could not be stored.");
  }
  try {
    const token = await accessTokenFor(input, account);
    const calendar = createCalendarClient();
    const payload = eventBody(body);
    const created = account.provider === "gmail"
      ? await calendar.googleCreateEvent(token!, account.selected_calendar_id || "primary", payload)
      : await calendar.microsoftCreateEvent(token!, { subject: body.title, body: { contentType: "Text", content: body.description }, start: { dateTime: body.startsAt, timeZone: body.timeZone }, end: { dateTime: body.endsAt, timeZone: body.timeZone }, attendees: body.attendees.map((address) => ({ emailAddress: { address }, type: "required" })) });
    await input.admin.from("meetings").update({ status: "confirmed", provider_confirmed: true, provider_event_id: created.id, provider_error: null }).eq("id", meeting.id);
    if (body.prospectId) {
      await input.admin.from("prospect_activities").insert({
        workspace_id: workspaceId,
        prospect_id: body.prospectId,
        activity_type: "meeting_booked",
        summary: "The calendar provider confirmed the meeting.",
        actor_user_id: input.userId,
        metadata: { providerEventId: created.id },
      });
    }
    return { id: meeting.id, status: "confirmed", providerConfirmed: true, providerEventId: created.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The calendar provider did not create the meeting.";
    await input.admin.from("meetings").update({ status: "draft", provider_confirmed: false, provider_error: message }).eq("id", meeting.id);
    return { id: meeting.id, status: "draft", providerConfirmed: false, providerEventId: null, error: message };
  }
}

async function rescheduleMeeting(input: MemberInput, workspaceId: string) {
  const body = z.object({ meetingId: uuid, startsAt: z.string().datetime(), endsAt: z.string().datetime(), timeZone: z.string().min(1) }).parse(input.body);
  const windowError = meetingWindowError({ startsAt: body.startsAt, endsAt: body.endsAt, timeZone: body.timeZone });
  if (windowError) {
    throw new HttpError(400, "VALIDATION_FAILED", windowError);
  }
  const { data: meeting } = await input.admin.from("meetings").select("*").eq("id", body.meetingId).eq("workspace_id", workspaceId).maybeSingle();
  if (!meeting?.provider_event_id || !meeting.connected_account_id) {
    throw new HttpError(409, "VALIDATION_FAILED", "Only a provider-confirmed meeting can be rescheduled.");
  }
  const { data: account } = await input.admin.from("connected_accounts").select("*").eq("id", meeting.connected_account_id).maybeSingle();
  if (!account) {
    throw new HttpError(409, "PROVIDER_UNCONFIGURED", "The calendar account is no longer connected.");
  }
  const token = await accessTokenFor(input, account);
  const calendar = createCalendarClient();
  const updated = account.provider === "gmail"
    ? await calendar.googleUpdateEvent(token!, account.selected_calendar_id || "primary", meeting.provider_event_id, { start: { dateTime: body.startsAt, timeZone: body.timeZone }, end: { dateTime: body.endsAt, timeZone: body.timeZone } })
    : await calendar.microsoftUpdateEvent(token!, meeting.provider_event_id, { start: { dateTime: body.startsAt, timeZone: body.timeZone }, end: { dateTime: body.endsAt, timeZone: body.timeZone } });
  await input.admin.from("meetings").update({ starts_at: body.startsAt, ends_at: body.endsAt, timezone: body.timeZone, status: "confirmed", provider_confirmed: true, provider_event_id: updated.id }).eq("id", meeting.id);
  return { id: meeting.id, status: "confirmed", providerConfirmed: true, providerEventId: updated.id };
}

async function cancelMeeting(input: MemberInput, workspaceId: string) {
  const body = z.object({ meetingId: uuid }).parse(input.body);
  const { data: meeting } = await input.admin.from("meetings").select("*").eq("id", body.meetingId).eq("workspace_id", workspaceId).maybeSingle();
  if (!meeting) {
    throw new HttpError(404, "NOT_FOUND", "Meeting not found.");
  }
  if (meeting.provider_event_id && meeting.connected_account_id) {
    const { data: account } = await input.admin.from("connected_accounts").select("*").eq("id", meeting.connected_account_id).maybeSingle();
    if (!account) {
      throw new HttpError(409, "PROVIDER_ERROR", "The calendar provider could not be reached for cancellation.");
    }
    const token = await accessTokenFor(input, account);
    const calendar = createCalendarClient();
    if (account.provider === "gmail") {
      await calendar.googleDeleteEvent(token!, account.selected_calendar_id || "primary", meeting.provider_event_id);
    } else {
      await calendar.microsoftDeleteEvent(token!, meeting.provider_event_id);
    }
  }
  await input.admin.from("meetings").update({ status: "cancelled", provider_confirmed: false }).eq("id", meeting.id);
  return { id: meeting.id, status: "cancelled", providerConfirmed: false };
}

import {
  analysisUsageSchema,
  emailGenerationSchema,
  meetingIsConfirmed,
  type EmailType,
} from "@prospectra/shared";
import { ErrorCode } from "@prospectra/shared";
import { z } from "zod";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import type { Json } from "@/types/database";
import { postWorker } from "@/services/worker-client";

const generationResponse = z.object({
  draft: emailGenerationSchema,
  warnings: z.array(z.string()),
  model: z.string(),
  usage: analysisUsageSchema,
});

const acceptedResponse = z.object({
  deliveryState: z.literal("accepted"),
  providerMessageId: z.string().nullable(),
  delivered: z.literal(false),
});

export const emailService = {
  async templates(workspaceId: string) {
    const { data, error } = await getSupabaseClient().from("email_templates").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
    return data ?? [];
  },
  async saveTemplate(input: { id?: string; workspaceId: string; name: string; category: string; subject: string; body: string }) {
    const row = { workspace_id: input.workspaceId, name: input.name, category: input.category, subject: input.subject, body: input.body };
    const query = input.id
      ? getSupabaseClient().from("email_templates").update(row).eq("id", input.id).select("*").single()
      : getSupabaseClient().from("email_templates").insert(row).select("*").single();
    const { data, error } = await query;
    if (error || !data) throw new AppError(ErrorCode.INTERNAL, error?.message ?? "Template was not saved.");
    return data;
  },
  async duplicateTemplate(id: string, workspaceId: string) {
    const { data: source, error } = await getSupabaseClient().from("email_templates").select("*").eq("id", id).eq("workspace_id", workspaceId).single();
    if (error || !source) throw new AppError(ErrorCode.NOT_FOUND, "Template not found.");
    return this.saveTemplate({ workspaceId, name: `${source.name} copy`, category: source.category, subject: source.subject, body: source.body });
  },
  async removeTemplate(id: string) {
    const { error } = await getSupabaseClient().from("email_templates").delete().eq("id", id);
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
  },
  async drafts(workspaceId: string) {
    const { data, error } = await getSupabaseClient().from("email_drafts").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
    return data ?? [];
  },
  async saveDraft(input: Record<string, Json | undefined>) {
    const query = input.id
      ? getSupabaseClient().from("email_drafts").update(input).eq("id", String(input.id)).select("*").single()
      : getSupabaseClient().from("email_drafts").insert(input).select("*").single();
    const { data, error } = await query;
    if (error || !data) throw new AppError(ErrorCode.INTERNAL, error?.message ?? "Draft was not saved.");
    return data;
  },
  generate(input: {
    workspaceId: string;
    prospectId: string | null;
    companyId: string | null;
    icpId: string | null;
    objective: string;
    emailType: EmailType;
    tone: string;
    length: "short" | "medium" | "long";
    callToAction: string;
    instructions: string;
  }) {
    return postWorker("/v1/email/generate", input, generationResponse);
  },
  testSend(input: { workspaceId: string; accountId: string; to: string; subject: string; body: string }) {
    return postWorker("/v1/email/test", input, acceptedResponse);
  },
  async accounts(workspaceId: string) {
    const { data, error } = await getSupabaseClient().from("connected_accounts").select("*").eq("workspace_id", workspaceId);
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
    return data ?? [];
  },
  startOAuth(input: { workspaceId: string; provider: "gmail" | "microsoft"; kind: "email" | "calendar" }) {
    return postWorker("/v1/email/oauth/start", input, z.object({ url: z.string().url() }));
  },
  disconnect(input: { workspaceId: string; accountId: string }) {
    return postWorker("/v1/email/disconnect", input, z.object({ disconnected: z.literal(true), providerRevocation: z.string() }));
  },
  connectResend(input: { workspaceId: string; fromAddress: string }) {
    return postWorker("/v1/email/resend", input, z.object({ account: z.object({ id: z.string() }) }));
  },
};

export const campaignService = {
  async list(workspaceId: string) {
    const { data, error } = await getSupabaseClient().from("campaigns").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
    return data ?? [];
  },
  async get(workspaceId: string, id: string) {
    const { data, error } = await getSupabaseClient().from("campaigns").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
    if (error || !data) throw new AppError(ErrorCode.NOT_FOUND, error?.message ?? "Campaign not found.");
    const steps = await getSupabaseClient().from("campaign_steps").select("*").eq("campaign_id", id).order("position");
    if (steps.error) throw new AppError(ErrorCode.INTERNAL, steps.error.message);
    return { campaign: data, steps: steps.data ?? [] };
  },
  async save(input: { workspaceId: string; id?: string; campaign: Record<string, Json | undefined>; steps: Array<{ subject: string; body: string; delayDays: number; branch: string }> }) {
    const query = input.id
      ? getSupabaseClient().from("campaigns").update(input.campaign).eq("id", input.id).select("*").single()
      : getSupabaseClient().from("campaigns").insert({ ...input.campaign, workspace_id: input.workspaceId, status: "DRAFT" }).select("*").single();
    const { data, error } = await query;
    if (error || !data) throw new AppError(ErrorCode.INTERNAL, error?.message ?? "Campaign was not saved.");
    await getSupabaseClient().from("campaign_steps").delete().eq("campaign_id", data.id);
    if (input.steps.length > 0) {
      const { error: stepError } = await getSupabaseClient().from("campaign_steps").insert(
        input.steps.map((step, index) => ({
          workspace_id: input.workspaceId,
          campaign_id: data.id,
          position: index + 1,
          subject: step.subject,
          body: step.body,
          delay_days: step.delayDays,
          branch_condition: step.branch,
        })),
      );
      if (stepError) throw new AppError(ErrorCode.INTERNAL, stepError.message);
    }
    return data;
  },
  async remove(id: string) {
    const { error } = await getSupabaseClient().from("campaigns").delete().eq("id", id).eq("status", "DRAFT");
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
  },
  activate(input: { workspaceId: string; campaignId: string }) {
    return postWorker(
      "/v1/campaigns/activate",
      input,
      z.object({ status: z.string(), enrolled: z.number(), skipped: z.array(z.object({ prospectId: z.string(), reasons: z.array(z.string()) })), reservedCredits: z.number() }),
    );
  },
  setStatus(input: { workspaceId: string; campaignId: string; status: "PAUSED" | "ACTIVE" | "CANCELLED" }) {
    return postWorker("/v1/campaigns/status", input, z.object({ status: z.string() }));
  },
  process(workspaceId: string) {
    return postWorker("/v1/outreach/process", { workspaceId }, z.object({ processed: z.number() }));
  },
  async monitor(workspaceId: string, campaignId: string) {
    const client = getSupabaseClient();
    const [enrollments, jobs, messages] = await Promise.all([
      client.from("campaign_enrollments").select("*").eq("campaign_id", campaignId),
      client.from("outreach_jobs").select("*").eq("campaign_id", campaignId),
      client.from("email_messages").select("*").eq("workspace_id", workspaceId).eq("campaign_id", campaignId),
    ]);
    if (enrollments.error || jobs.error || messages.error) {
      throw new AppError(ErrorCode.INTERNAL, enrollments.error?.message ?? jobs.error?.message ?? messages.error?.message ?? "Campaign activity could not be loaded.");
    }
    return { enrollments: enrollments.data ?? [], jobs: jobs.data ?? [], messages: messages.data ?? [] };
  },
};

export const inboxService = {
  async list(workspaceId: string) {
    const { data, error } = await getSupabaseClient().from("inbox_conversations").select("*").eq("workspace_id", workspaceId).order("last_message_at", { ascending: false });
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
    return data ?? [];
  },
  async messages(conversationId: string) {
    const { data, error } = await getSupabaseClient().from("email_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
    return data ?? [];
  },
  async notes(conversationId: string) {
    const { data, error } = await getSupabaseClient().from("inbox_notes").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
    return data ?? [];
  },
  async addNote(input: { workspaceId: string; conversationId: string; body: string }) {
    const { error } = await getSupabaseClient().from("inbox_notes").insert({ workspace_id: input.workspaceId, conversation_id: input.conversationId, body: input.body });
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
  },
  async update(id: string, patch: Record<string, Json | undefined>) {
    const { error } = await getSupabaseClient().from("inbox_conversations").update(patch).eq("id", id);
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
  },
  sync(workspaceId: string) {
    return postWorker("/v1/inbox/sync", { workspaceId }, z.object({ inserted: z.number(), duplicates: z.array(z.string()) }));
  },
  suggest(input: { workspaceId: string; conversationId: string }) {
    return postWorker(
      "/v1/inbox/suggest",
      input,
      z.object({
        suggestion: z.object({ suggestedResponse: z.string(), summary: z.string(), nextStep: z.string(), intent: z.string(), sentiment: z.string() }),
        requiresApproval: z.literal(true),
      }),
    );
  },
  reply(input: { workspaceId: string; conversationId: string; accountId: string; to: string; subject: string; body: string }) {
    return postWorker("/v1/inbox/reply", input, acceptedResponse);
  },
};

const meetingResult = z.object({
  id: z.string(),
  status: z.string(),
  providerConfirmed: z.boolean(),
  providerEventId: z.string().nullable(),
  error: z.string().optional(),
});

export const meetingService = {
  meetingIsConfirmed,
  async list(workspaceId: string) {
    const { data, error } = await getSupabaseClient().from("meetings").select("*").eq("workspace_id", workspaceId).order("starts_at", { ascending: false });
    if (error) throw new AppError(ErrorCode.INTERNAL, error.message);
    return data ?? [];
  },
  availability(input: { workspaceId: string; accountId: string; rangeStart: string; rangeEnd: string; durationMinutes: number }) {
    return postWorker("/v1/calendar/availability", input, z.object({ slots: z.array(z.object({ start: z.string(), end: z.string() })), source: z.string() }));
  },
  create(input: Record<string, unknown>) {
    return postWorker("/v1/calendar/meetings", input, meetingResult);
  },
  reschedule(input: { workspaceId: string; meetingId: string; startsAt: string; endsAt: string; timeZone: string }) {
    return postWorker("/v1/calendar/meetings/reschedule", input, meetingResult);
  },
  cancel(input: { workspaceId: string; meetingId: string }) {
    return postWorker("/v1/calendar/meetings/cancel", input, meetingResult);
  },
};

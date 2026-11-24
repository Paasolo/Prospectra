import {
  agentStartInputSchema,
  estimateAgentCredits,
} from "@prospectra/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { approveAgentSegment } from "../agent/execute.js";
import { describeProviders, type WorkerConfig } from "../config.js";
import { HttpError } from "./errors.js";

type Admin = SupabaseClient;
const uuid = z.string().uuid();

export async function startAgentRun(input: {
  admin: Admin;
  config: WorkerConfig;
  userId: string;
  body: unknown;
}): Promise<{ id: string; status: string; estimatedCredits: number }> {
  const body = agentStartInputSchema.parse(input.body);
  const estimated = estimateAgentCredits(body.prospectCap);
  const { data: balanceRow, error: balanceError } = await input.admin
    .from("credit_accounts")
    .select("balance")
    .eq("workspace_id", body.workspaceId)
    .maybeSingle();
  if (balanceError) {
    throw new HttpError(500, "INTERNAL", balanceError.message);
  }
  if ((balanceRow?.balance ?? 0) < estimated) {
    throw new HttpError(
      402,
      "CREDIT_INSUFFICIENT",
      `This agent run needs about ${estimated} credits and the workspace has ${balanceRow?.balance ?? 0}.`,
    );
  }

  const { data: mailbox } = await input.admin
    .from("connected_accounts")
    .select("id")
    .eq("workspace_id", body.workspaceId)
    .eq("kind", "email")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();

  const providers = describeProviders(input.config);
  const discoveryConfigured =
    providers.find((item) => item.role === "company_discovery")?.state === "configured" &&
    providers.find((item) => item.role === "contact_discovery")?.state === "configured";

  const { data: run, error } = await input.admin
    .from("agent_runs")
    .insert({
      workspace_id: body.workspaceId,
      status: "queued",
      website_url: body.websiteUrl.trim() || null,
      offer_description: body.offerDescription.trim() || null,
      company_name: body.companyName.trim() || null,
      prospect_cap: body.prospectCap,
      estimated_credits: estimated,
      reserved_credits: estimated,
      discovery_configured: discoveryConfigured,
      mailbox_connected: Boolean(mailbox),
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !run) {
    throw new HttpError(500, "INTERNAL", error?.message ?? "Could not create the agent run.");
  }

  const { data: reservation, error: reserveError } = await input.admin.rpc("reserve_workspace_credits", {
    p_workspace_id: body.workspaceId,
    p_amount: estimated,
    p_reason: "outbound_agent",
    p_reference_type: "agent_run",
    p_reference_id: run.id,
    p_actor: input.userId,
    p_idempotency_key: `agent:${run.id}`,
    p_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  if (reserveError) {
    await input.admin.from("agent_runs").update({
      status: "failed",
      error_code: "CREDIT_INSUFFICIENT",
      error_detail: reserveError.message,
    }).eq("id", run.id);
    throw new HttpError(
      reserveError.message.toLowerCase().includes("insufficient") ? 402 : 500,
      reserveError.message.toLowerCase().includes("insufficient") ? "CREDIT_INSUFFICIENT" : "INTERNAL",
      reserveError.message,
    );
  }

  await input.admin.from("agent_runs").update({ reservation_id: reservation }).eq("id", run.id);

  const { error: enqueueError } = await input.admin.rpc("enqueue_background_job", {
    p_workspace_id: body.workspaceId,
    p_job_type: "outbound_agent",
    p_payload: {
      runId: run.id,
      workspaceId: body.workspaceId,
      actorId: input.userId,
      reservationId: reservation,
    },
    p_idempotency_key: `outbound_agent:${run.id}`,
    p_run_at: new Date().toISOString(),
    p_max_attempts: 3,
  });
  if (enqueueError) {
    await input.admin.rpc("release_workspace_credits", { p_reservation_id: reservation, p_actor: input.userId });
    await input.admin.from("agent_runs").update({
      status: "failed",
      error_code: "ENQUEUE_FAILED",
      error_detail: enqueueError.message,
      reservation_id: null,
    }).eq("id", run.id);
    throw new HttpError(500, "INTERNAL", enqueueError.message);
  }

  return { id: run.id, status: "queued", estimatedCredits: estimated };
}

export async function approveSegment(input: {
  admin: Admin;
  config: WorkerConfig;
  userId: string;
  body: unknown;
}): Promise<{
  segmentId: string;
  campaignId: string | null;
  action: "activate" | "leave_draft";
  status: string;
  estimatedSendCredits: number;
  setupMessage: string | null;
}> {
  const body = z.object({ workspaceId: uuid, segmentId: uuid }).parse(input.body);
  try {
    return await approveAgentSegment(
      { admin: input.admin, config: input.config },
      { workspaceId: body.workspaceId, segmentId: body.segmentId, userId: input.userId },
    );
  } catch (error) {
    const category =
      error && typeof error === "object" && "category" in error
        ? String((error as { category?: string }).category)
        : "";
    const message = error instanceof Error ? error.message : "Segment approval failed.";
    if (category === "validation") {
      throw new HttpError(400, "VALIDATION_FAILED", message);
    }
    if (category === "quota") {
      throw new HttpError(402, "CREDIT_INSUFFICIENT", message);
    }
    if (category === "configuration") {
      throw new HttpError(503, "PROVIDER_UNCONFIGURED", message);
    }
    throw new HttpError(500, "INTERNAL", message);
  }
}

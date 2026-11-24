import {
  AGENT_DEFAULT_PROSPECT_CAP,
  costPerLead,
  estimateAgentCredits,
  type AgentRunStatus,
  type AgentSegmentStatus,
} from "@prospectra/shared";
import { z } from "zod";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { postWorker } from "@/services/worker-client";

const startResponse = z.object({
  id: z.string().uuid(),
  status: z.string(),
  estimatedCredits: z.number().int().nonnegative(),
});

const approveResponse = z.object({
  segmentId: z.string().uuid(),
  campaignId: z.string().uuid().nullable(),
  action: z.enum(["activate", "leave_draft"]),
  status: z.string(),
  estimatedSendCredits: z.number().int().nonnegative(),
  setupMessage: z.string().nullable(),
});

export type AgentRunRecord = {
  id: string;
  workspace_id: string;
  status: AgentRunStatus | string;
  website_url: string | null;
  offer_description: string | null;
  company_name: string | null;
  prospect_cap: number;
  offer_summary: string | null;
  competitors: unknown;
  estimated_credits: number;
  reserved_credits: number;
  consumed_credits: number;
  discovery_configured: boolean;
  mailbox_connected: boolean;
  error_code: string | null;
  error_detail: string | null;
  created_at: string;
};

export type AgentSegmentRecord = {
  id: string;
  workspace_id: string;
  run_id: string;
  position: number;
  name: string;
  who_buys: string;
  fit_score: number;
  evidence_note: string;
  status: AgentSegmentStatus | string;
  discovery_state: string;
  setup_message: string | null;
  prospect_ids: string[];
  draft_ids: string[];
  list_id: string | null;
  campaign_id: string | null;
  sends: number;
  positive_replies: number;
  credits_spent: number;
  approved_at: string | null;
  created_at: string;
};

export const agentService = {
  estimateCredits(prospectCap = AGENT_DEFAULT_PROSPECT_CAP) {
    return estimateAgentCredits(prospectCap);
  },

  costPerLead(creditsSpent: number, positiveReplies: number) {
    return costPerLead(creditsSpent, positiveReplies);
  },

  async start(input: {
    workspaceId: string;
    websiteUrl: string;
    offerDescription: string;
    companyName: string;
    prospectCap: number;
  }) {
    return postWorker("/v1/agent/runs", input, startResponse);
  },

  async approve(input: { workspaceId: string; segmentId: string }) {
    return postWorker("/v1/agent/segments/approve", input, approveResponse);
  },

  async listRuns(workspaceId: string): Promise<AgentRunRecord[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("agent_runs")
      .select(
        "id, workspace_id, status, website_url, offer_description, company_name, prospect_cap, offer_summary, competitors, estimated_credits, reserved_credits, consumed_credits, discovery_configured, mailbox_connected, error_code, error_detail, created_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      throw error;
    }
    return (data ?? []) as AgentRunRecord[];
  },

  async getRun(workspaceId: string, runId: string): Promise<AgentRunRecord | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("agent_runs")
      .select(
        "id, workspace_id, status, website_url, offer_description, company_name, prospect_cap, offer_summary, competitors, estimated_credits, reserved_credits, consumed_credits, discovery_configured, mailbox_connected, error_code, error_detail, created_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("id", runId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return (data as AgentRunRecord | null) ?? null;
  },

  async listSegments(workspaceId: string, runId: string): Promise<AgentSegmentRecord[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("agent_segments")
      .select(
        "id, workspace_id, run_id, position, name, who_buys, fit_score, evidence_note, status, discovery_state, setup_message, prospect_ids, draft_ids, list_id, campaign_id, sends, positive_replies, credits_spent, approved_at, created_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("run_id", runId)
      .order("position", { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []) as AgentSegmentRecord[];
  },
};

import { ErrorCode } from "@prospectra/shared";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { WorkspaceRole } from "@/types/workspace";

export type WorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceSettingsRecord = {
  workspace_id: string;
  industry: string | null;
  company_size: string | null;
  website_url: string | null;
  product_description: string | null;
  target_customers: string | null;
  target_markets: string[] | null;
  sales_objectives: string | null;
  onboarding_completed_at: string | null;
  onboarding_step: number;
};

function requireClient() {
  const init = getSupabaseInitResult();
  if (init.status === "unconfigured") {
    throw new AppError(ErrorCode.PROVIDER_UNCONFIGURED, init.reason);
  }
  return init.client;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export const workspaceService = {
  async listWorkspaces(): Promise<WorkspaceRecord[]> {
    const client = requireClient();
    const { data, error } = await client.from("workspaces").select("*").order("created_at", { ascending: true });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return (data ?? []) as WorkspaceRecord[];
  },

  async createWorkspace(name: string): Promise<WorkspaceRecord> {
    const client = requireClient();
    const baseSlug = slugify(name) || "workspace";
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

    const { data, error } = await client.rpc("create_workspace_with_owner", {
      p_name: name,
      p_slug: slug,
    });

    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }

    logger.info("Workspace created", { workspaceId: data.id });
    return data as WorkspaceRecord;
  },

  async getSettings(workspaceId: string): Promise<WorkspaceSettingsRecord | null> {
    const client = requireClient();
    const { data, error } = await client
      .from("workspace_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data as WorkspaceSettingsRecord | null;
  },

  async updateSettings(
    workspaceId: string,
    patch: Partial<Omit<WorkspaceSettingsRecord, "workspace_id">>,
  ): Promise<void> {
    const client = requireClient();
    const { error } = await client.from("workspace_settings").update(patch).eq("workspace_id", workspaceId);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async listMembers(workspaceId: string) {
    const client = requireClient();
    const { data, error } = await client
      .from("workspace_members")
      .select("id, workspace_id, user_id, role, created_at")
      .eq("workspace_id", workspaceId);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data ?? [];
  },

  async inviteMember(workspaceId: string, email: string, role: WorkspaceRole) {
    const client = requireClient();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const { error } = await client.from("workspace_invitations").insert({
      workspace_id: workspaceId,
      email,
      role,
      token,
      expires_at: expiresAt,
    });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    logger.info("Workspace invitation created", { workspaceId, email, role });
    return { token, expiresAt };
  },
};

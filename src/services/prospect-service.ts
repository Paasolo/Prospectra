import {
  findDuplicatePairs,
  mapCsvImport,
  normalizeDomain,
  normalizeEmail,
  parseCsv,
  PROSPECT_STAGES,
  prospectsToCsv,
  type CsvProspectField,
  type ProspectDraft,
  type ProspectStage,
} from "@prospectra/shared";
import { ErrorCode } from "@prospectra/shared";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import type { Database, Json } from "@/types/database";

export type ProspectRow = Database["public"]["Tables"]["prospects"]["Row"] & {
  companies: { id: string; name: string; normalized_domain: string | null; website_url: string | null; industry: string | null } | null;
};

type ListQuery = {
  search?: string;
  stage?: ProspectStage | "";
  sort?: "created_at" | "full_name" | "stage";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

async function activity(input: {
  workspaceId: string;
  prospectId: string;
  type: string;
  summary: string;
  actorUserId?: string | null;
  metadata?: Json;
}) {
  const { error } = await getSupabaseClient().from("prospect_activities").insert({
    workspace_id: input.workspaceId,
    prospect_id: input.prospectId,
    activity_type: input.type,
    summary: input.summary,
    actor_user_id: input.actorUserId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
  }
}

async function companyIdFor(workspaceId: string, name: string, domain: string | null): Promise<string | null> {
  if (!name && !domain) {
    return null;
  }
  const client = getSupabaseClient();
  if (domain) {
    const { data } = await client
      .from("companies")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("normalized_domain", domain)
      .maybeSingle();
    if (data) {
      return data.id;
    }
  }
  const { data, error } = await client
    .from("companies")
    .insert({
      workspace_id: workspaceId,
      name: name || domain || "Unknown company",
      domain,
      normalized_domain: domain,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new AppError(ErrorCode.INTERNAL, error?.message ?? "Could not save the company.", { cause: error });
  }
  return data.id;
}

function draftToRow(workspaceId: string, draft: ProspectDraft, companyId: string | null, source: string) {
  const email = normalizeEmail(draft.email);
  return {
    workspace_id: workspaceId,
    company_id: companyId,
    full_name: draft.fullName || null,
    email: email,
    normalized_email: email,
    job_title: draft.jobTitle || null,
    phone: draft.phone || null,
    department: draft.department || null,
    seniority: draft.seniority || null,
    location: draft.location || null,
    linkedin_url: draft.linkedinUrl || null,
    stage: draft.stage,
    tags: draft.tags,
    source,
    email_verified: false,
  };
}

export const prospectService = {
  stages: PROSPECT_STAGES,

  async list(workspaceId: string, query: ListQuery = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sort = query.sort ?? "created_at";
    let request = getSupabaseClient()
      .from("prospects")
      .select("*, companies(id, name, normalized_domain, website_url, industry)", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .is("merged_into_prospect_id", null);
    if (query.stage) {
      request = request.eq("stage", query.stage);
    }
    const search = query.search?.replace(/[,()]/g, " ").trim();
    if (search) {
      request = request.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,job_title.ilike.%${search}%`);
    }
    const { data, error, count } = await request
      .order(sort, { ascending: query.direction === "asc" })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return { rows: (data ?? []) as unknown as ProspectRow[], count: count ?? 0, page, pageSize };
  },

  async get(workspaceId: string, id: string) {
    const { data, error } = await getSupabaseClient()
      .from("prospects")
      .select("*, companies(id, name, normalized_domain, website_url, industry)")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    if (!data) {
      throw new AppError(ErrorCode.NOT_FOUND, "Prospect not found.");
    }
    return data as unknown as ProspectRow;
  },

  async create(workspaceId: string, draft: ProspectDraft, actorUserId: string | null) {
    const companyId = await companyIdFor(workspaceId, draft.companyName, normalizeDomain(draft.companyDomain));
    const { data, error } = await getSupabaseClient()
      .from("prospects")
      .insert(draftToRow(workspaceId, draft, companyId, "manual"))
      .select("id")
      .single();
    if (error || !data) {
      throw new AppError(ErrorCode.INTERNAL, error?.message ?? "Could not create the prospect.", { cause: error });
    }
    await activity({
      workspaceId,
      prospectId: data.id,
      type: "prospect_created",
      summary: "Prospect created.",
      actorUserId,
    });
    return data.id;
  },

  async update(workspaceId: string, id: string, draft: ProspectDraft, actorUserId: string | null) {
    const companyId = await companyIdFor(workspaceId, draft.companyName, normalizeDomain(draft.companyDomain));
    const { error } = await getSupabaseClient()
      .from("prospects")
      .update(draftToRow(workspaceId, draft, companyId, "manual"))
      .eq("workspace_id", workspaceId)
      .eq("id", id);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    await activity({ workspaceId, prospectId: id, type: "prospect_updated", summary: "Prospect updated.", actorUserId });
  },

  async remove(workspaceId: string, ids: string[]) {
    const { error } = await getSupabaseClient().from("prospects").delete().eq("workspace_id", workspaceId).in("id", ids);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async setStage(workspaceId: string, ids: string[], stage: ProspectStage, actorUserId: string | null) {
    const stages = await this.stagesFor(workspaceId);
    if (!stages.some((item) => item.code === stage && item.is_enabled)) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, "That pipeline stage is not enabled.");
    }
    const { error } = await getSupabaseClient()
      .from("prospects")
      .update({ stage })
      .eq("workspace_id", workspaceId)
      .in("id", ids);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    for (const id of ids) {
      await activity({
        workspaceId,
        prospectId: id,
        type: "status_changed",
        summary: `Stage changed to ${stage}.`,
        actorUserId,
      });
    }
  },

  async assign(workspaceId: string, ids: string[], ownerUserId: string | null, actorUserId: string | null) {
    const { error } = await getSupabaseClient()
      .from("prospects")
      .update({ owner_user_id: ownerUserId })
      .eq("workspace_id", workspaceId)
      .in("id", ids);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    for (const id of ids) {
      await activity({ workspaceId, prospectId: id, type: "assigned", summary: "Prospect assignment changed.", actorUserId });
    }
  },

  async setTags(workspaceId: string, id: string, tags: string[], actorUserId: string | null) {
    const { error } = await getSupabaseClient().from("prospects").update({ tags }).eq("workspace_id", workspaceId).eq("id", id);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    await activity({ workspaceId, prospectId: id, type: "prospect_updated", summary: "Tags updated.", actorUserId });
  },

  async notes(workspaceId: string, prospectId: string) {
    const { data, error } = await getSupabaseClient()
      .from("prospect_notes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data ?? [];
  },

  async addNote(workspaceId: string, prospectId: string, body: string, actorUserId: string | null) {
    const { error } = await getSupabaseClient().from("prospect_notes").insert({
      workspace_id: workspaceId,
      prospect_id: prospectId,
      body,
      created_by: actorUserId,
    });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    await activity({ workspaceId, prospectId, type: "note_added", summary: "Note added.", actorUserId });
  },

  async activities(workspaceId: string, prospectId: string) {
    const { data, error } = await getSupabaseClient()
      .from("prospect_activities")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data ?? [];
  },

  async stagesFor(workspaceId: string) {
    const client = getSupabaseClient();
    await client.rpc("ensure_default_pipeline_stages", { p_workspace_id: workspaceId });
    const { data, error } = await client
      .from("pipeline_stages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data ?? [];
  },

  async setStageEnabled(workspaceId: string, code: string, isEnabled: boolean) {
    if (code === "NEW" && !isEnabled) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, "The New stage stays available.");
    }
    const { error } = await getSupabaseClient()
      .from("pipeline_stages")
      .update({ is_enabled: isEnabled })
      .eq("workspace_id", workspaceId)
      .eq("code", code);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  previewCsv(text: string, mapping: Partial<Record<CsvProspectField, string>>, existingEmails: string[], existingDomains: string[]) {
    const table = parseCsv(text);
    const headers = table[0] ?? [];
    return mapCsvImport({ headers, rows: table.slice(1), mapping, existingEmails, existingDomains });
  },

  async importRows(workspaceId: string, drafts: ProspectDraft[], actorUserId: string | null) {
    const imported: string[] = [];
    const failed: Array<{ row: ProspectDraft; message: string }> = [];
    for (const draft of drafts) {
      try {
        imported.push(await this.create(workspaceId, draft, actorUserId));
      } catch (error) {
        failed.push({ row: draft, message: error instanceof Error ? error.message : "Import failed." });
      }
    }
    return { imported: imported.length, failed };
  },

  async exportCsv(workspaceId: string) {
    const { rows } = await this.list(workspaceId, { page: 1, pageSize: 1000 });
    return prospectsToCsv(
      rows.map((row) => ({
        fullName: row.full_name,
        email: row.email,
        jobTitle: row.job_title,
        companyName: row.companies?.name ?? null,
        stage: row.stage,
        tags: row.tags ?? [],
      })),
    );
  },

  async duplicateCandidates(workspaceId: string) {
    const { rows } = await this.list(workspaceId, { page: 1, pageSize: 300 });
    return findDuplicatePairs(
      rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        normalizedEmail: row.normalized_email,
        domain: row.companies?.normalized_domain ?? null,
        linkedinUrl: row.linkedin_url,
      })),
    );
  },

  async merge(input: {
    workspaceId: string;
    survivingId: string;
    mergedId: string;
    reason: string;
    confidence: "likely" | "uncertain";
    actorUserId: string | null;
  }) {
    if (input.confidence === "uncertain") {
      // Uncertain matches are merged only after an explicit review call from the UI.
    }
    const survivor = await this.get(input.workspaceId, input.survivingId);
    const merged = await this.get(input.workspaceId, input.mergedId);
    const patch: Record<string, string | boolean | null> = {};
    const fill = (key: keyof ProspectRow, value: string | null) => {
      if (!survivor[key] && value) {
        patch[key] = value;
      }
    };
    fill("full_name", merged.full_name);
    fill("email", merged.email);
    fill("job_title", merged.job_title);
    fill("phone", merged.phone);
    fill("department", merged.department);
    fill("seniority", merged.seniority);
    fill("location", merged.location);
    fill("linkedin_url", merged.linkedin_url);
    if (!survivor.email && merged.email) {
      patch.normalized_email = merged.normalized_email;
    }
    const client = getSupabaseClient();
    if (Object.keys(patch).length) {
      await client.from("prospects").update(patch).eq("id", survivor.id);
    }
    const { error } = await client.from("prospect_merges").insert({
      workspace_id: input.workspaceId,
      surviving_prospect_id: survivor.id,
      merged_prospect_id: merged.id,
      match_reason: input.reason,
      confidence: input.confidence,
      snapshot: merged as unknown as Json,
      merged_by: input.actorUserId,
    });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    await client.from("prospects").update({ merged_into_prospect_id: survivor.id }).eq("id", merged.id);
    await activity({
      workspaceId: input.workspaceId,
      prospectId: survivor.id,
      type: "prospect_merged",
      summary: `Merged prospect ${merged.id}.`,
      actorUserId: input.actorUserId,
      metadata: { confidence: input.confidence, reason: input.reason },
    });
  },

  async addFromDiscovery(input: {
    workspaceId: string;
    name: string | null;
    email: string | null;
    jobTitle: string | null;
    companyName: string | null;
    domain: string | null;
    location: string | null;
    linkedinUrl: string | null;
    actorUserId: string | null;
  }) {
    return this.create(
      input.workspaceId,
      {
        fullName: input.name ?? "",
        email: input.email ?? "",
        jobTitle: input.jobTitle ?? "",
        companyName: input.companyName ?? "",
        companyDomain: input.domain ?? "",
        phone: "",
        department: "",
        seniority: "",
        location: input.location ?? "",
        linkedinUrl: input.linkedinUrl ?? "",
        stage: "NEW",
        tags: ["discovery"],
      },
      input.actorUserId,
    );
  },
};

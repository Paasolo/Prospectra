import { prospectsToCsv } from "@prospectra/shared";
import { ErrorCode } from "@prospectra/shared";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";

export const listService = {
  async list(workspaceId: string, search = "") {
    let request = getSupabaseClient().from("prospect_lists").select("*").eq("workspace_id", workspaceId).order("name");
    if (search.trim()) {
      request = request.ilike("name", `%${search.trim().replace(/[%_]/g, "")}%`);
    }
    const { data, error } = await request;
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    const lists = data ?? [];
    const counts = await Promise.all(
      lists.map(async (list) => {
        const { count } = await getSupabaseClient()
          .from("prospect_list_members")
          .select("id", { count: "exact", head: true })
          .eq("list_id", list.id);
        return [list.id, count ?? 0] as const;
      }),
    );
    const countMap = new Map(counts);
    return lists.map((list) => ({ ...list, count: countMap.get(list.id) ?? 0 }));
  },

  async create(workspaceId: string, name: string, description: string, createdBy: string | null) {
    const { data, error } = await getSupabaseClient()
      .from("prospect_lists")
      .insert({ workspace_id: workspaceId, name, description, created_by: createdBy })
      .select("id")
      .single();
    if (error || !data) {
      throw new AppError(ErrorCode.INTERNAL, error?.message ?? "Could not create the list.", { cause: error });
    }
    return data.id;
  },

  async update(workspaceId: string, id: string, name: string, description: string) {
    const { error } = await getSupabaseClient()
      .from("prospect_lists")
      .update({ name, description })
      .eq("workspace_id", workspaceId)
      .eq("id", id);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async remove(workspaceId: string, id: string) {
    const { error } = await getSupabaseClient().from("prospect_lists").delete().eq("workspace_id", workspaceId).eq("id", id);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async addProspects(workspaceId: string, listId: string, prospectIds: string[]) {
    if (!prospectIds.length) {
      return;
    }
    const { error } = await getSupabaseClient().from("prospect_list_members").upsert(
      prospectIds.map((prospectId) => ({ workspace_id: workspaceId, list_id: listId, prospect_id: prospectId })),
      { onConflict: "list_id,prospect_id" },
    );
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async removeProspect(workspaceId: string, listId: string, prospectId: string) {
    const { error } = await getSupabaseClient()
      .from("prospect_list_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("list_id", listId)
      .eq("prospect_id", prospectId);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async members(workspaceId: string, listId: string) {
    const { data, error } = await getSupabaseClient()
      .from("prospect_list_members")
      .select("prospect_id, prospects(id, full_name, email, job_title, stage, tags)")
      .eq("workspace_id", workspaceId)
      .eq("list_id", listId);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
    return data ?? [];
  },

  async export(workspaceId: string, listId: string) {
    const members = await this.members(workspaceId, listId);
    return prospectsToCsv(
      members.map((member) => {
        const prospect = Array.isArray(member.prospects) ? member.prospects[0] : member.prospects;
        return {
          fullName: prospect?.full_name ?? null,
          email: prospect?.email ?? null,
          jobTitle: prospect?.job_title ?? null,
          companyName: null,
          stage: prospect?.stage ?? "",
          tags: prospect?.tags ?? [],
        };
      }),
    );
  },
};

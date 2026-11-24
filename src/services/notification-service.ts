import { NOTIFICATION_TYPES } from "@prospectra/shared";
import { getSupabaseClient } from "@/integrations/supabase/client";

export const notificationService = {
  async list(userId: string) {
    const client = getSupabaseClient();
    const { data, error } = await client.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async preferences(userId: string, workspaceId: string) {
    const client = getSupabaseClient();
    const { data, error } = await client.from("notification_preferences").select("*").eq("user_id", userId).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async markRead(id: string) {
    const client = getSupabaseClient();
    const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async markAllRead(userId: string) {
    const client = getSupabaseClient();
    const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (error) throw new Error(error.message);
  },
  async remove(id: string) {
    const client = getSupabaseClient();
    const { error } = await client.from("notifications").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
  async setPreference(input: { userId: string; workspaceId: string; type: string; inApp: boolean; email: boolean }) {
    const client = getSupabaseClient();
    const { error } = await client.from("notification_preferences").upsert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      type: input.type,
      in_app: input.inApp,
      email: input.email,
    });
    if (error) throw new Error(error.message);
  },
  types: NOTIFICATION_TYPES,
};

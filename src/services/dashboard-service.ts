import { ErrorCode } from "@prospectra/shared";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";

export type DashboardMetrics = {
  totalProspects: number;
  newProspects: number;
  qualifiedProspects: number;
  companiesDiscovered: number;
  activeCampaigns: number;
  emailsAttempted: number;
  repliesReceived: number;
  meetingsBooked: number;
  remainingCredits: number | null;
  unavailable: string[];
};

function requireClient() {
  const init = getSupabaseInitResult();
  if (init.status === "unconfigured") {
    throw new AppError(ErrorCode.PROVIDER_UNCONFIGURED, init.reason);
  }
  return init.client;
}

export const dashboardService = {
  async getMetrics(workspaceId: string): Promise<DashboardMetrics> {
    const client = requireClient();
    const unavailable: string[] = [];

    const count = async (
      table: "prospects" | "companies" | "campaigns" | "email_messages" | "meetings",
      column?: string,
      value?: string | boolean,
    ) => {
      let query = client.from(table).select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId);
      if (column !== undefined && value !== undefined) {
        query = query.eq(column, value);
      }
      const { count: total, error } = await query;
      if (error) {
        throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
      }
      return total ?? 0;
    };

    const [
      totalProspects,
      newProspects,
      qualifiedProspects,
      companiesDiscovered,
      activeCampaigns,
      emailsAttempted,
      repliesReceived,
      meetingsBooked,
    ] = await Promise.all([
      count("prospects"),
      count("prospects", "stage", "NEW"),
      count("prospects", "stage", "QUALIFIED"),
      count("companies"),
      count("campaigns", "status", "ACTIVE"),
      count("email_messages", "direction", "outbound"),
      count("email_messages", "direction", "inbound"),
      count("meetings", "provider_confirmed", true),
    ]);

    let remainingCredits: number | null = null;
    const { data: creditAccount, error: creditError } = await client
      .from("credit_accounts")
      .select("balance")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (creditError) {
      unavailable.push("remainingCredits");
    } else {
      remainingCredits = creditAccount?.balance ?? 0;
    }

    return {
      totalProspects,
      newProspects,
      qualifiedProspects,
      companiesDiscovered,
      activeCampaigns,
      emailsAttempted,
      repliesReceived,
      meetingsBooked,
      remainingCredits,
      unavailable,
    };
  },
};

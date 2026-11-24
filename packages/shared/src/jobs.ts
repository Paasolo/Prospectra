export const JOB_TYPES = [
  "website_analysis",
  "company_discovery",
  "contact_discovery",
  "prospect_enrichment",
  "ai_generation",
  "outbound_agent",
  "campaign_scheduling",
  "email_sending",
  "email_sync",
  "calendar_sync",
  "analytics_aggregation",
  "notification_dispatch",
  "billing_reconciliation",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export type JobErrorCategory = "permanent" | "temporary" | "configuration" | "quota" | "validation";

export function classifyJobFailure(input: { category?: JobErrorCategory; message: string }): JobErrorCategory {
  if (input.category) return input.category;
  const message = input.message.toLowerCase();
  if (message.includes("not configured") || message.includes("unconfigured")) return "configuration";
  if (message.includes("quota") || message.includes("insufficient")) return "quota";
  if (message.includes("invalid") || message.includes("validation")) return "validation";
  if (message.includes("timeout") || message.includes("rate limit") || message.includes("temporar")) return "temporary";
  return "permanent";
}

export function nextJobDecision(input: { attempts: number; maxAttempts: number; category: JobErrorCategory }): { status: "pending" | "dead_letter"; retry: boolean } {
  if (input.category === "temporary" && input.attempts < input.maxAttempts) {
    return { status: "pending", retry: true };
  }
  return { status: "dead_letter", retry: false };
}

export function jobBackoffMs(attempt: number): number {
  const step = Math.min(Math.max(attempt, 1), 8);
  return 1_000 * 2 ** (step - 1);
}

export function duplicateJob(existingKeys: Set<string>, key: string): boolean {
  return existingKeys.has(key);
}

export const NOTIFICATION_TYPES = [
  "discovery_completed",
  "enrichment_completed",
  "campaign_scheduled",
  "campaign_activated",
  "campaign_paused",
  "campaign_completed",
  "new_reply",
  "meeting_booked",
  "low_credits",
  "payment_received",
  "subscription_changed",
  "integration_disconnected",
  "background_job_failed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function unreadCount(rows: Array<{ readAt: string | null }>): number {
  return rows.filter((row) => row.readAt === null).length;
}

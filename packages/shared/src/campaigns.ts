import { unknownTemplateVariables } from "./email-studio.js";

export const CAMPAIGN_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const STOP_EVENTS = ["reply", "unsubscribe", "bounce", "complaint", "suppressed", "cancelled"] as const;

export type StopEvent = (typeof STOP_EVENTS)[number];

export type SendDecision =
  | { action: "send" }
  | { action: "defer"; reason: string }
  | { action: "stop"; reason: string }
  | { action: "reconcile"; reason: string }
  | { action: "dead_letter"; reason: string };

const WEEKDAY: Record<string, number> = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedClock(date: Date, timeZone: string): { weekday: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    throw new Error("Invalid timezone.");
  }
  const weekday = WEEKDAY[parts.find((part) => part.type === "weekday")?.value ?? ""] ?? 7;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { weekday, minutes: (hour % 24) * 60 + minute };
}

export function isInsideSendingWindow(input: {
  now: Date;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  days: number[];
}): boolean {
  if (input.endMinutes <= input.startMinutes) {
    return false;
  }
  const clock = zonedClock(input.now, input.timeZone);
  return input.days.includes(clock.weekday) && clock.minutes >= input.startMinutes && clock.minutes < input.endMinutes;
}

export function retryDelayMs(attempt: number): number {
  const step = Math.min(Math.max(attempt, 1), 6);
  return 60_000 * 2 ** (step - 1);
}

export function decideOutreach(input: {
  campaignStatus: string;
  enrollmentStatus: string;
  suppressed: boolean;
  ambiguousAttempt: boolean;
  insideWindow: boolean;
  sentToday: number;
  dailyLimit: number;
  attempts: number;
  maxAttempts: number;
}): SendDecision {
  if (input.campaignStatus === "PAUSED" || input.campaignStatus === "SCHEDULED") {
    return { action: "defer", reason: `Campaign is ${input.campaignStatus}.` };
  }
  if (["CANCELLED", "COMPLETED", "DRAFT"].includes(input.campaignStatus)) {
    return { action: "stop", reason: `Campaign is ${input.campaignStatus}.` };
  }
  if (input.enrollmentStatus === "paused") {
    return { action: "defer", reason: "Enrollment is paused." };
  }
  if (input.enrollmentStatus !== "active") {
    return { action: "stop", reason: `Enrollment is ${input.enrollmentStatus}.` };
  }
  if (input.suppressed) {
    return { action: "stop", reason: "Recipient is suppressed." };
  }
  if (input.ambiguousAttempt) {
    return { action: "reconcile", reason: "The previous send has no definitive provider result." };
  }
  if (input.attempts >= input.maxAttempts) {
    return { action: "dead_letter", reason: "Retry limit reached." };
  }
  if (!input.insideWindow) {
    return { action: "defer", reason: "Outside the sending window." };
  }
  if (input.sentToday >= input.dailyLimit) {
    return { action: "defer", reason: "Daily sending limit reached." };
  }
  return { action: "send" };
}

export function stopReasonForEvent(event: StopEvent): string {
  return event;
}

export function enrollmentBlockers(input: {
  email: string | null;
  suppressed: boolean;
  duplicate: boolean;
  accountConnected: boolean;
  steps: number;
}): string[] {
  const reasons: string[] = [];
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    reasons.push("A valid recipient email is required.");
  }
  if (input.suppressed) {
    reasons.push("The recipient is suppressed.");
  }
  if (input.duplicate) {
    reasons.push("The prospect is already enrolled.");
  }
  if (!input.accountConnected) {
    reasons.push("A connected sending account is required.");
  }
  if (input.steps < 1) {
    reasons.push("The campaign needs at least one email step.");
  }
  return reasons;
}

export function activationBlockers(input: {
  name: string;
  objective: string;
  steps: Array<{ subject: string; body: string }>;
  accountConnected: boolean;
  audienceCount: number;
  dailyLimit: number;
  timeZone: string;
}): string[] {
  const reasons: string[] = [];
  if (!input.name.trim()) {
    reasons.push("A campaign name is required.");
  }
  if (!input.objective.trim()) {
    reasons.push("A campaign objective is required.");
  }
  if (input.steps.length < 1) {
    reasons.push("Add at least one email step.");
  }
  if (!input.accountConnected) {
    reasons.push("Connect a sending account before activation.");
  }
  if (input.audienceCount < 1) {
    reasons.push("Select at least one prospect.");
  }
  if (input.dailyLimit < 1 || input.dailyLimit > 200) {
    reasons.push("Daily sending limit must be between 1 and 200.");
  }
  try {
    zonedClock(new Date(), input.timeZone);
  } catch {
    reasons.push("A valid timezone is required.");
  }
  const variables = unknownTemplateVariables(input.steps.map((step) => `${step.subject}\n${step.body}`).join("\n"));
  if (variables.length > 0) {
    reasons.push(`Unknown template variables: ${variables.join(", ")}.`);
  }
  const missingOptOut = input.steps.some((step) => !/unsubscribe|opt out/i.test(step.body));
  if (input.steps.length > 0 && missingOptOut) {
    reasons.push("Each email step needs an unsubscribe or opt-out line.");
  }
  return reasons;
}

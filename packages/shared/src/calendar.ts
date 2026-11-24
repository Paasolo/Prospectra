import { z } from "zod";
import { zonedClock } from "./campaigns.js";

export const meetingInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(""),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timeZone: z.string().trim().min(1).max(80),
  attendees: z.array(z.string().email()).max(20).default([]),
  location: z.string().trim().max(500).default(""),
  prospectId: z.string().uuid().nullable().default(null),
  companyId: z.string().uuid().nullable().default(null),
  conversationId: z.string().uuid().nullable().default(null),
  campaignId: z.string().uuid().nullable().default(null),
});

export type MeetingInput = z.infer<typeof meetingInputSchema>;

export function meetingIsConfirmed(input: {
  providerConfirmed: boolean;
  providerEventId: string | null | undefined;
  status?: string | null;
}): boolean {
  if (input.status && input.status !== "confirmed") {
    return false;
  }
  return input.providerConfirmed === true && Boolean(input.providerEventId);
}

export function meetingWindowError(input: { startsAt: string; endsAt: string; timeZone: string }): string | null {
  const start = Date.parse(input.startsAt);
  const end = Date.parse(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "The meeting end must be after the start.";
  }
  if (end - start > 8 * 60 * 60 * 1000) {
    return "Meetings are limited to 8 hours.";
  }
  try {
    zonedClock(new Date(start), input.timeZone);
  } catch {
    return "A valid timezone is required.";
  }
  return null;
}

export type BusyInterval = { start: string; end: string };

export function proposeSlots(input: {
  rangeStart: Date;
  rangeEnd: Date;
  durationMinutes: number;
  bufferMinutes: number;
  timeZone: string;
  workingStartMinutes: number;
  workingEndMinutes: number;
  workingDays: number[];
  busy: BusyInterval[];
  limit?: number;
}): Array<{ start: string; end: string }> {
  if (input.durationMinutes < 15 || input.workingEndMinutes <= input.workingStartMinutes) {
    return [];
  }
  const slots: Array<{ start: string; end: string }> = [];
  const step = 30 * 60 * 1000;
  const duration = input.durationMinutes * 60 * 1000;
  const buffer = input.bufferMinutes * 60 * 1000;
  const busy = input.busy
    .map((interval) => ({ start: Date.parse(interval.start), end: Date.parse(interval.end) }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end));

  for (let cursor = input.rangeStart.getTime(); cursor + duration <= input.rangeEnd.getTime(); cursor += step) {
    const clock = zonedClock(new Date(cursor), input.timeZone);
    const endMinutes = clock.minutes + input.durationMinutes;
    if (!input.workingDays.includes(clock.weekday)) {
      continue;
    }
    if (clock.minutes < input.workingStartMinutes || endMinutes > input.workingEndMinutes) {
      continue;
    }
    const end = cursor + duration;
    const blocked = busy.some((interval) => cursor - buffer < interval.end && end + buffer > interval.start);
    if (blocked) {
      continue;
    }
    slots.push({ start: new Date(cursor).toISOString(), end: new Date(end).toISOString() });
    if (slots.length >= (input.limit ?? 12)) {
      break;
    }
  }
  return slots;
}

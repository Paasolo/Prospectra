import { z } from "zod";
import { providerErrorFromStatus } from "../providers/errors.js";

const busySchema = z.object({
  calendars: z.record(z.object({ busy: z.array(z.object({ start: z.string(), end: z.string() })).default([]) })).default({}),
});

const graphScheduleSchema = z.object({
  value: z
    .array(
      z.object({
        scheduleItems: z
          .array(z.object({ start: z.object({ dateTime: z.string() }), end: z.object({ dateTime: z.string() }) }))
          .optional(),
      }),
    )
    .default([]),
});

const eventSchema = z.object({ id: z.string() });

export function createCalendarClient(fetchImpl: typeof fetch = fetch) {
  return {
    async googleBusy(accessToken: string, input: { calendarId: string; timeMin: string; timeMax: string }) {
      const response = await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ timeMin: input.timeMin, timeMax: input.timeMax, items: [{ id: input.calendarId }] }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, await response.text());
      }
      const parsed = busySchema.parse(await response.json());
      return parsed.calendars[input.calendarId]?.busy ?? [];
    },

    async googleCreateEvent(accessToken: string, calendarId: string, body: Record<string, unknown>) {
      const response = await fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, text);
      }
      return eventSchema.parse(JSON.parse(text) as unknown);
    },

    async googleUpdateEvent(accessToken: string, calendarId: string, eventId: string, body: Record<string, unknown>) {
      const response = await fetchImpl(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: "PATCH",
          headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        },
      );
      const text = await response.text();
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, text);
      }
      return eventSchema.parse(JSON.parse(text) as unknown);
    },

    async googleDeleteEvent(accessToken: string, calendarId: string, eventId: string) {
      const response = await fetchImpl(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20_000) },
      );
      if (!response.ok && response.status !== 404) {
        throw providerErrorFromStatus(response.status, await response.text());
      }
    },

    async microsoftBusy(accessToken: string, input: { email: string; start: string; end: string; timeZone: string }) {
      const response = await fetchImpl("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          schedules: [input.email],
          startTime: { dateTime: input.start, timeZone: input.timeZone },
          endTime: { dateTime: input.end, timeZone: input.timeZone },
          availabilityViewInterval: 30,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, await response.text());
      }
      const parsed = graphScheduleSchema.parse(await response.json());
      return (parsed.value[0]?.scheduleItems ?? []).map((item) => ({
        start: item.start.dateTime,
        end: item.end.dateTime,
      }));
    },

    async microsoftCreateEvent(accessToken: string, body: Record<string, unknown>) {
      const response = await fetchImpl("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, text);
      }
      return eventSchema.parse(JSON.parse(text) as unknown);
    },

    async microsoftUpdateEvent(accessToken: string, eventId: string, body: Record<string, unknown>) {
      const response = await fetchImpl(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw providerErrorFromStatus(response.status, text);
      }
      return eventSchema.parse(JSON.parse(text) as unknown);
    },

    async microsoftDeleteEvent(accessToken: string, eventId: string) {
      const response = await fetchImpl(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok && response.status !== 404) {
        throw providerErrorFromStatus(response.status, await response.text());
      }
    },
  };
}

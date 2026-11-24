import { describe, expect, it } from "vitest";
import { meetingIsConfirmed, proposeSlots } from "./calendar.js";
import { duplicateMessageIds, inboxMessageKey } from "./inbox.js";

describe("inbox and calendar", () => {
  it("detects duplicate provider messages", () => {
    const key = inboxMessageKey("Gmail", "abc");
    expect(duplicateMessageIds([key], [key, "gmail:def"])).toEqual(["gmail:abc"]);
  });

  it("offers open slots and withholds confirmation without a provider event", () => {
    expect(meetingIsConfirmed({ providerConfirmed: true, providerEventId: null })).toBe(false);
    expect(meetingIsConfirmed({ providerConfirmed: true, providerEventId: "evt_1" })).toBe(true);
    const slots = proposeSlots({
      rangeStart: new Date("2026-01-05T09:00:00.000Z"),
      rangeEnd: new Date("2026-01-05T12:00:00.000Z"),
      durationMinutes: 30,
      bufferMinutes: 15,
      timeZone: "UTC",
      workingStartMinutes: 9 * 60,
      workingEndMinutes: 17 * 60,
      workingDays: [1],
      busy: [{ start: "2026-01-05T10:00:00.000Z", end: "2026-01-05T11:00:00.000Z" }],
      limit: 5,
    });
    expect(slots[0]?.start).toBe("2026-01-05T09:00:00.000Z");
    expect(slots.some((slot) => slot.start === "2026-01-05T10:00:00.000Z")).toBe(false);
  });
});

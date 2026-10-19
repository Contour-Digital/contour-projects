import { describe, expect, it } from "vitest";
import { computeSlots } from "./availability";
import type { WeeklyHours } from "@/lib/types";

const weekdays9to5: WeeklyHours = {
  "1": [{ start: "09:00", end: "17:00" }],
  "2": [{ start: "09:00", end: "17:00" }],
  "3": [{ start: "09:00", end: "17:00" }],
  "4": [{ start: "09:00", end: "17:00" }],
  "5": [{ start: "09:00", end: "17:00" }],
  "6": [],
  "7": [],
};

const settings = {
  timezone: "Australia/Sydney",
  weekly_hours: weekdays9to5,
  min_notice_hours: 12,
  max_days_ahead: 60,
  buffer_minutes: 15,
  slot_interval_minutes: 30,
};

// Wed 1 Oct 2026, 9am Sydney (AEST +10:00; DST starts 4 Oct).
const now = new Date("2026-09-30T23:00:00Z");

describe("computeSlots", () => {
  it("offers working-hours slots in the owner's timezone", () => {
    const slots = computeSlots({
      settings, durationMinutes: 30, busy: [], from: "2026-10-02", to: "2026-10-02",
      visitorTimezone: "Australia/Sydney", now,
    });
    const day = slots["2026-10-02"];
    expect(day[0]).toBe("2026-10-01T23:00:00.000Z"); // 9:00 Sydney
    expect(day.at(-1)).toBe("2026-10-02T06:30:00.000Z"); // 16:30 Sydney, ends at 17:00
    expect(day).toHaveLength(16);
  });

  it("skips weekends and respects minimum notice", () => {
    const slots = computeSlots({
      settings, durationMinutes: 30, busy: [], from: "2026-10-01", to: "2026-10-04",
      visitorTimezone: "Australia/Sydney", now,
    });
    expect(slots["2026-10-03"]).toBeUndefined();
    expect(slots["2026-10-04"]).toBeUndefined();
    // 12h notice from 9am Wed leaves nothing on Wednesday.
    expect(slots["2026-10-01"]).toBeUndefined();
  });

  it("keeps a buffer around busy blocks", () => {
    const busy = [{ start: new Date("2026-10-02T00:00:00Z"), end: new Date("2026-10-02T01:00:00Z") }]; // 10-11am
    const day = computeSlots({
      settings, durationMinutes: 30, busy, from: "2026-10-02", to: "2026-10-02",
      visitorTimezone: "Australia/Sydney", now,
    })["2026-10-02"];
    expect(day).not.toContain("2026-10-01T23:30:00.000Z"); // 9:30-10:00 touches the 15 min buffer
    expect(day).not.toContain("2026-10-02T01:00:00.000Z"); // 11:00 is inside the trailing buffer
    expect(day).toContain("2026-10-01T23:00:00.000Z"); // 9:00 is clear
    expect(day).toContain("2026-10-02T01:30:00.000Z"); // 11:30 is clear
  });

  it("handles the daylight saving change", () => {
    const day = computeSlots({
      settings, durationMinutes: 30, busy: [], from: "2026-10-05", to: "2026-10-05",
      visitorTimezone: "Australia/Sydney", now,
    })["2026-10-05"];
    expect(day[0]).toBe("2026-10-04T22:00:00.000Z"); // 9:00 AEDT (+11)
  });

  it("groups by the visitor's own date", () => {
    // 9am Fri Sydney is 4pm Thu in Los Angeles.
    const slots = computeSlots({
      settings, durationMinutes: 60, busy: [], from: "2026-10-01", to: "2026-10-01",
      visitorTimezone: "America/Los_Angeles", now,
    });
    expect(slots["2026-10-01"][0]).toBe("2026-10-01T23:00:00.000Z");
  });

  it("uses a repeating schedule instead of weekly hours when chosen", () => {
    const repeating = {
      ...settings,
      max_days_ahead: 120,
      availability_mode: "repeating" as const,
      // Available 9-12 on 19 Oct 2026 and every 8 days after, plus 13-15 the day after each.
      repeating_hours: [
        { start_date: "2026-10-19", every_days: 8, hours: [{ start: "09:00", end: "12:00" }] },
        { start_date: "2026-10-20", every_days: 8, hours: [{ start: "13:00", end: "15:00" }] },
      ],
    };
    const slots = computeSlots({
      settings: repeating, durationMinutes: 60, busy: [], from: "2026-10-01", to: "2026-11-30",
      visitorTimezone: "Australia/Sydney", now,
    });
    expect(Object.keys(slots)).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-27", "2026-10-28",
      "2026-11-04", "2026-11-05", "2026-11-12", "2026-11-13",
      "2026-11-20", "2026-11-21", "2026-11-28", "2026-11-29",
    ]);
    expect(slots["2026-10-19"][0]).toBe("2026-10-18T22:00:00.000Z"); // 9:00 AEDT
    expect(slots["2026-10-19"]).toHaveLength(5); // 9:00 to 11:00 starts for a 1h meeting
    expect(slots["2026-10-20"][0]).toBe("2026-10-20T02:00:00.000Z"); // 13:00 AEDT
  });

  it("does not repeat back before the start date or double up overlapping rules", () => {
    const slots = computeSlots({
      settings: {
        ...settings,
        availability_mode: "repeating",
        repeating_hours: [
          { start_date: "2026-10-10", every_days: 2, hours: [{ start: "09:00", end: "10:00" }] },
          { start_date: "2026-10-10", every_days: 4, hours: [{ start: "09:00", end: "10:00" }] },
        ],
      },
      durationMinutes: 30, busy: [], from: "2026-10-02", to: "2026-10-14",
      visitorTimezone: "Australia/Sydney", now,
    });
    expect(Object.keys(slots)).toEqual(["2026-10-10", "2026-10-12", "2026-10-14"]);
    expect(slots["2026-10-14"]).toHaveLength(2);
  });
});

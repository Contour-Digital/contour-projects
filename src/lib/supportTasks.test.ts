import { describe, expect, it } from "vitest";
import { groupByScheduledDate, tagOf } from "./supportTasks";

const t = (title: string, scheduled_date: string | null) => ({ title, scheduled_date });

describe("groupByScheduledDate", () => {
  const tasks = [
    t("Banner", "2026-10-24"),
    t("Old", "2026-10-01"),
    t("Older", "2026-09-30"),
    t("B today", "2026-10-22"),
    t("A today", "2026-10-22"),
    t("Tomorrow job", "2026-10-23"),
    t("Someday", null),
    t("Next year", "2027-01-05"),
  ];

  it("puts past dates under Overdue, then a heading per day, then unscheduled", () => {
    const groups = groupByScheduledDate(tasks, { today: "2026-10-22" });
    expect(groups.map((g) => g.title)).toEqual([
      "Overdue",
      "Today · Thursday 22 October",
      "Tomorrow · Friday 23 October",
      "Saturday 24 October",
      "Tuesday 5 January 2027",
      "Not scheduled",
    ]);
    expect(groups[0].rows.map((r) => r.title)).toEqual(["Older", "Old"]);
    expect(groups[1].rows.map((r) => r.title)).toEqual(["A today", "B today"]);
    expect(groups[1].tone).toBe("today");
  });

  it("lists completed work by day, most recent first, with no Overdue", () => {
    const groups = groupByScheduledDate([t("Old", "2026-10-01"), t("Newer", "2026-10-20")], { today: "2026-10-22", completed: true });
    expect(groups.map((g) => g.title)).toEqual(["Tuesday 20 October", "Thursday 1 October"]);
  });

  it("returns nothing for no tasks", () => {
    expect(groupByScheduledDate([], { today: "2026-10-22" })).toEqual([]);
  });
});

describe("tagOf", () => {
  it("has the On-Demand Support prices", () => {
    expect(tagOf("content_updates").price).toBe(45);
    expect(tagOf("site_enhancements").price).toBe(90);
    expect(tagOf("advanced_customization").price).toBe(180);
    expect(tagOf("notification_banner").price).toBe(35);
  });
});

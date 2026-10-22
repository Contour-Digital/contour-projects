import { describe, expect, it } from "vitest";
import { byClientName } from "./clients";

describe("byClientName", () => {
  it("sorts A to Z by business name, falling back to the person's name, ignoring case", () => {
    const clients = [
      { name: "Zoe Adams", company: "Disability Leadership Institute" },
      { name: "Amy Brown", company: null },
      { name: "Tom Lee", company: "coastal Physio" },
      { name: "Mia Chen", company: "Bloom Florist" },
      { name: "Eve", company: "" },
    ];
    expect([...clients].sort(byClientName).map((c) => c.company || c.name)).toEqual([
      "Amy Brown",
      "Bloom Florist",
      "coastal Physio",
      "Disability Leadership Institute",
      "Eve",
    ]);
  });
});

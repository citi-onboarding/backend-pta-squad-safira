import { describe, expect, it } from "vitest";

import { businessDate, daysBetween } from "./business-date.js";

describe("businessDate", () => {
  it("returns the calendar date in America/Recife", () => {
    expect(businessDate(new Date("2026-11-27T15:00:00Z"))).toBe("2026-11-27");
  });

  it("keeps the previous day late in the evening in Recife, even when it is already the next day in UTC", () => {
    expect(businessDate(new Date("2026-11-28T01:30:00Z"))).toBe("2026-11-27");
  });
});

describe("daysBetween", () => {
  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-11-17", "2026-11-27")).toBe(10);
  });

  it("counts across months", () => {
    expect(daysBetween("2026-10-28", "2026-11-27")).toBe(30);
  });
});

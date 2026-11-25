import { describe, expect, it } from "vitest";

import { calcularDataLimiteAviso } from "./notice-deadline.js";

describe("calcularDataLimiteAviso", () => {
  it.each([
    ["2026-11-30", 30, "2026-10-31"],
    ["2027-01-14", 30, "2026-12-15"],
    ["2027-02-28", 60, "2026-12-30"],
    ["2026-12-09", 15, "2026-11-24"],
  ])("subtracts the notice from %s minus %i days", (fim, dias, esperado) => {
    expect(calcularDataLimiteAviso(fim, dias)).toBe(esperado);
  });

  it("rejects an invalid end date", () => {
    expect(() => calcularDataLimiteAviso("2026-02-30", 30)).toThrow(RangeError);
  });

  it.each([-1, 1.5])("rejects notice period %s", (dias) => {
    expect(() => calcularDataLimiteAviso("2026-11-30", dias)).toThrow(
      RangeError,
    );
  });
});

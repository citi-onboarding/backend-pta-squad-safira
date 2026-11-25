import { describe, expect, it } from "vitest";

import { calcularFimDaVigencia } from "./term-end.js";

describe("calcularFimDaVigencia", () => {
  it.each([
    ["2025-12-10", 12, "2026-12-09"],
    ["2026-01-31", 1, "2026-02-27"],
    ["2026-03-01", 12, "2027-02-28"],
    ["2026-01-15", 18, "2027-07-14"],
  ])("ends %s plus %i months minus one day", (base, meses, esperado) => {
    expect(calcularFimDaVigencia(base, meses)).toBe(esperado);
  });

  it("rejects an invalid base date", () => {
    expect(() => calcularFimDaVigencia("2026-02-30", 12)).toThrow(RangeError);
  });

  it.each([0, -1, 1.5])("rejects a duration of %s months", (meses) => {
    expect(() => calcularFimDaVigencia("2025-12-10", meses)).toThrow(
      RangeError,
    );
  });
});

import { describe, expect, it } from "vitest";

import { centavosParaReais, formatarReais } from "./money.js";

describe("centavosParaReais", () => {
  it("converts integer cents to reais", () => {
    expect(centavosParaReais(12345)).toBe(123.45);
  });

  it("rejects fractional cents", () => {
    expect(() => centavosParaReais(10.5)).toThrow(RangeError);
  });
});

describe("formatarReais", () => {
  it("formats cents as Brazilian Real with thousands separators", () => {
    expect(formatarReais(123456789)).toBe("R$ 1.234.567,89");
  });

  it("formats zero and negative amounts", () => {
    expect(formatarReais(0)).toBe("R$ 0,00");
    expect(formatarReais(-150)).toBe("-R$ 1,50");
  });

  it("rejects fractional cents", () => {
    expect(() => formatarReais(0.1)).toThrow(RangeError);
  });
});

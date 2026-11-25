import { describe, expect, it } from "vitest";

import { canAccessClient } from "./require-role.js";

describe("salesperson portfolio", () => {
  it("allows a salesperson to access a client from the own portfolio", () => {
    expect(
      canAccessClient({ papel: "VENDEDOR", codigoVendedor: "V01" }, "V01"),
    ).toBe(true);
  });

  it("denies a salesperson access to a client from another portfolio", () => {
    expect(
      canAccessClient({ papel: "VENDEDOR", codigoVendedor: "V01" }, "V02"),
    ).toBe(false);
  });

  it("allows the sales manager to access a client of any portfolio", () => {
    expect(
      canAccessClient({ papel: "GERENTE", codigoVendedor: null }, "V02"),
    ).toBe(true);
  });

  it("allows the finance role to access a client of any portfolio", () => {
    expect(
      canAccessClient({ papel: "FINANCEIRO", codigoVendedor: null }, "V02"),
    ).toBe(true);
  });

  it("denies a salesperson without a code access to a client with a salesperson", () => {
    expect(
      canAccessClient({ papel: "VENDEDOR", codigoVendedor: null }, "V01"),
    ).toBe(false);
  });

  it("denies a salesperson without a code access to a client without a salesperson", () => {
    expect(
      canAccessClient({ papel: "VENDEDOR", codigoVendedor: null }, null),
    ).toBe(false);
  });

  it("denies the administrator access to clients", () => {
    expect(
      canAccessClient({ papel: "ADMINISTRADOR", codigoVendedor: null }, "V01"),
    ).toBe(false);
  });
});

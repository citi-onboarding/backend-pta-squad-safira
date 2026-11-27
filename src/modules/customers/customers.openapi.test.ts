import { describe, expect, it } from "vitest";

import { createOpenApiDocument } from "../../shared/http/openapi.js";
import "./customers.openapi.js";

describe("customers OpenAPI contract", () => {
  const document = createOpenApiDocument();

  it("publishes the client search with its query and page response", () => {
    const search = document.paths?.["/clientes"]?.get;

    expect(search).toBeDefined();
    expect(
      search?.parameters?.map(
        (parameter) => "name" in parameter && parameter.name,
      ),
    ).toEqual(["busca", "pagina"]);
    expect(Object.keys(search?.responses ?? {}).sort()).toEqual([
      "200",
      "400",
      "401",
      "403",
    ]);
  });

  it("publishes the client profile with 404 for clients outside the portfolio", () => {
    const profile = document.paths?.["/clientes/{id}"]?.get;

    expect(profile).toBeDefined();
    expect(Object.keys(profile?.responses ?? {}).sort()).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
    ]);
  });

  it("names the shared response schemas for the web client", () => {
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        "CustomerPage",
        "CustomerListItem",
        "CustomerProfile",
        "CreditPosition",
        "OverdueReceivable",
      ]),
    );
  });
});

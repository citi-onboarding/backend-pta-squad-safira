import { describe, expect, it } from "vitest";

import { createOpenApiDocument } from "./openapi.js";

describe("createOpenApiDocument", () => {
  it("generates the base OpenAPI 3.1 document", () => {
    const document = createOpenApiDocument();

    expect(document.openapi).toBe("3.1.0");
    expect(document.info.title).toMatch(/ API$/);
  });
});

import { describe, expect, it } from "vitest";

import { createOpenApiDocument } from "../../shared/http/openapi.js";
import "./example-item.openapi.js";

describe("example item OpenAPI contract", () => {
  it("documents collection and item operations", () => {
    const document = createOpenApiDocument();

    expect(document.paths?.["/api/v1/example-items"]).toHaveProperty("post");
    expect(document.paths?.["/api/v1/example-items/{id}"]).toHaveProperty(
      "delete",
    );
  });
});

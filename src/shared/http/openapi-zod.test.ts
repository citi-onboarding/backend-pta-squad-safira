import { describe, expect, it } from "vitest";

import { z } from "./openapi-zod.js";

describe("openapi-zod", () => {
  it("extends Zod schemas with the openapi metadata method", () => {
    expect(typeof z.string().openapi).toBe("function");

    const schema = z.string().openapi({ description: "A documented field" });

    expect(schema.parse("value")).toBe("value");
    expect(schema.safeParse(1).success).toBe(false);
  });
});

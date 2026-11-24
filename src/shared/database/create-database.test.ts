import { describe, expect, it } from "vitest";

import { createDatabase } from "./create-database.js";

describe("createDatabase", () => {
  it("creates a client from an explicit connection string without connecting", async () => {
    const database = createDatabase(
      "postgresql://postgres:postgres@localhost:5432/unused",
    );

    expect(typeof database.$disconnect).toBe("function");
    await database.$disconnect();
  });

  it("falls back to DATABASE_URL from the validated environment", async () => {
    const database = createDatabase();

    expect(typeof database.$disconnect).toBe("function");
    await database.$disconnect();
  });
});

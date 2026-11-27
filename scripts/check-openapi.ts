import { readFile } from "node:fs/promises";
import "../src/modules/auth/auth.openapi.js";
import "../src/modules/users/users.openapi.js";
import "../src/modules/sync/sync.openapi.js";
import { createOpenApiDocument } from "../src/shared/http/openapi.js";

const expected = `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`;
const current = await readFile("openapi.json", "utf8");

if (current !== expected) {
  throw new Error(
    "openapi.json is stale. Run pnpm openapi:generate and commit the result.",
  );
}

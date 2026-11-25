import { writeFile } from "node:fs/promises";
import "../src/modules/auth/auth.openapi.js";
import { createOpenApiDocument } from "../src/shared/http/openapi.js";

await writeFile(
  "openapi.json",
  `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`,
  "utf8",
);

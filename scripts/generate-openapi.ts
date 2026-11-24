import { writeFile } from "node:fs/promises";

import { createOpenApiDocument } from "../src/shared/http/openapi.js";

await writeFile(
  "openapi.json",
  `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`,
  "utf8",
);

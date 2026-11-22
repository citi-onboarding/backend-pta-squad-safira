import { writeFile } from "node:fs/promises";

// <example-item-openapi>
import "../src/modules/example-items/example-item.openapi.js";
// </example-item-openapi>
import { createOpenApiDocument } from "../src/shared/http/openapi.js";

await writeFile(
  "openapi.json",
  `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`,
  "utf8",
);

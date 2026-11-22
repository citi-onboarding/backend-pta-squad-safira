import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import type { OpenAPIObject } from "openapi3-ts/oas31";

import { PROJECT_DISPLAY_NAME } from "../project.js";

export const openApiRegistry = new OpenAPIRegistry();

export function createOpenApiDocument(): OpenAPIObject {
  return new OpenApiGeneratorV31(openApiRegistry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: `${PROJECT_DISPLAY_NAME} API`,
      version: "0.1.0",
      description:
        "Contract generated from the same Zod schemas used at runtime.",
    },
    servers: [
      { url: "http://localhost:3001", description: "Local development" },
    ],
  });
}

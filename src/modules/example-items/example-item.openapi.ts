import { openApiRegistry } from "../../shared/http/openapi.js";
import { z } from "../../shared/http/openapi-zod.js";
import {
  createExampleItemSchema,
  exampleItemIdSchema,
  exampleItemListSchema,
  exampleItemSchema,
  updateExampleItemSchema,
} from "./example-item.schemas.js";

openApiRegistry.register(
  "Problem",
  z.object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    instance: z.string(),
    requestId: z.string(),
  }),
);

const json = (
  schema: typeof exampleItemSchema | typeof exampleItemListSchema,
) => ({
  "application/json": { schema },
});

openApiRegistry.register("ExampleItem", exampleItemSchema);
openApiRegistry.register("ExampleItemList", exampleItemListSchema);

openApiRegistry.registerPath({
  method: "get",
  path: "/api/v1/example-items",
  tags: ["Example Items"],
  summary: "List example items",
  responses: {
    200: { description: "Example items", content: json(exampleItemListSchema) },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/api/v1/example-items",
  tags: ["Example Items"],
  summary: "Create an example item",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createExampleItemSchema } },
    },
  },
  responses: {
    201: { description: "Created", content: json(exampleItemSchema) },
    400: { description: "Invalid request" },
  },
});

for (const definition of [
  { method: "get", summary: "Get an example item", response: 200 },
  {
    method: "patch",
    summary: "Update an example item",
    response: 200,
    body: updateExampleItemSchema,
  },
  { method: "delete", summary: "Delete an example item", response: 204 },
] as const) {
  openApiRegistry.registerPath({
    method: definition.method,
    path: "/api/v1/example-items/{id}",
    tags: ["Example Items"],
    summary: definition.summary,
    request: {
      params: exampleItemIdSchema,
      ...(definition.body
        ? {
            body: {
              required: true,
              content: { "application/json": { schema: definition.body } },
            },
          }
        : {}),
    },
    responses: {
      [definition.response]:
        definition.response === 204
          ? { description: "Deleted" }
          : { description: "Example item", content: json(exampleItemSchema) },
      404: { description: "Not found" },
    },
  });
}

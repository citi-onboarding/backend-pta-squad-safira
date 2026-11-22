import { Router } from "express";
import type { Router as ExpressRouter } from "express";

import { validate } from "../../shared/http/validate.js";
import {
  exampleItemSchema,
  createExampleItemSchema,
  exampleItemIdSchema,
  updateExampleItemSchema,
} from "./example-item.schemas.js";
import type { ExampleItemService } from "./example-item.service.js";
import "./example-item.openapi.js";

function serialize(item: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return exampleItemSchema.parse({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
}

export function createExampleItemRouter(
  service: ExampleItemService,
): ExpressRouter {
  const router = Router();

  router.get("/", async (_request, response) => {
    const items = await service.list();
    response.json(items.map(serialize));
  });

  router.post(
    "/",
    validate({ body: createExampleItemSchema }),
    async (request, response) => {
      const input = createExampleItemSchema.parse(request.body);
      const item = await service.create(input);
      response
        .location(`/api/v1/example-items/${item.id}`)
        .status(201)
        .json(serialize(item));
    },
  );

  router.get(
    "/:id",
    validate({ params: exampleItemIdSchema }),
    async (request, response) => {
      const { id } = exampleItemIdSchema.parse(request.params);
      response.json(serialize(await service.get(id)));
    },
  );

  router.patch(
    "/:id",
    validate({ params: exampleItemIdSchema, body: updateExampleItemSchema }),
    async (request, response) => {
      const { id } = exampleItemIdSchema.parse(request.params);
      const input = updateExampleItemSchema.parse(request.body);
      response.json(serialize(await service.update(id, input)));
    },
  );

  router.delete(
    "/:id",
    validate({ params: exampleItemIdSchema }),
    async (request, response) => {
      const { id } = exampleItemIdSchema.parse(request.params);
      await service.delete(id);
      response.status(204).send();
    },
  );

  return router;
}

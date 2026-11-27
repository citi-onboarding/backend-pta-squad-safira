import { openApiRegistry } from "../../shared/http/openapi.js";
import {
  clienteCodeSchema,
  clienteSyncResultSchema,
  syncStatusSchema,
} from "./sync.schemas.js";

openApiRegistry.registerPath({
  method: "get",
  path: "/sync/status",
  tags: ["Sync"],
  summary: "Get the last successful ERP synchronization and the latest result",
  responses: {
    200: {
      description: "Synchronization status",
      content: { "application/json": { schema: syncStatusSchema } },
    },
    401: { description: "No valid session" },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/sync/clientes/{codigo}",
  tags: ["Sync"],
  summary: "Synchronize one client from the ERP now",
  request: { params: clienteCodeSchema },
  responses: {
    200: {
      description: "Client synchronized",
      content: { "application/json": { schema: clienteSyncResultSchema } },
    },
    401: { description: "No valid session" },
    403: { description: "Only the Administrator role may trigger it" },
    404: { description: "The ERP has no client with this code" },
    409: { description: "A synchronization is already in progress" },
    503: { description: "The ERP is unavailable" },
  },
});

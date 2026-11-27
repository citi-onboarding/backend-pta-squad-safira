import { Router } from "express";
import type { RequestHandler, Router as ExpressRouter } from "express";

import { HttpProblem } from "../../shared/http/problem.js";
import { requireRole } from "../../shared/http/require-role.js";
import { validate } from "../../shared/http/validate.js";
import {
  clienteCodeSchema,
  clienteSyncResultSchema,
  syncStatusSchema,
} from "./sync.schemas.js";
import {
  ClienteNotFoundInErpError,
  SyncInProgressError,
} from "./sync.service.js";
import type { SyncService } from "./sync.service.js";
import "./sync.openapi.js";

interface SyncRouterOptions {
  syncService: SyncService;
  authenticate: RequestHandler;
}

function toProblem(error: unknown): unknown {
  if (error instanceof ClienteNotFoundInErpError) {
    return new HttpProblem(404, "Not Found", error.message);
  }
  if (error instanceof SyncInProgressError) {
    return new HttpProblem(409, "Conflict", error.message);
  }
  return error;
}

export function createSyncRouter({
  syncService,
  authenticate,
}: SyncRouterOptions): ExpressRouter {
  const router = Router();
  router.use(authenticate);

  router.get("/status", async (_request, response) => {
    const { ultimaSincronizacaoOk, ultimoResultado } =
      await syncService.status();
    response.json(
      syncStatusSchema.parse({
        ultimaSincronizacaoOk: ultimaSincronizacaoOk?.toISOString() ?? null,
        ultimoResultado,
      }),
    );
  });

  router.post(
    "/clientes/:codigo",
    requireRole("ADMINISTRADOR"),
    validate({ params: clienteCodeSchema }),
    async (request, response) => {
      const { codigo } = clienteCodeSchema.parse(request.params);
      try {
        response.json(
          clienteSyncResultSchema.parse(await syncService.syncCliente(codigo)),
        );
      } catch (error) {
        throw toProblem(error);
      }
    },
  );

  return router;
}

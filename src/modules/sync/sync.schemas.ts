import {
  ResultadoRegistro,
  StatusCliente,
} from "../../shared/database/generated/enums.js";
import { z } from "../../shared/http/openapi-zod.js";

export const clienteCodeSchema = z.object({
  codigo: z.string().trim().min(1).max(40),
});

export const syncStatusSchema = z.strictObject({
  ultimaSincronizacaoOk: z.iso.datetime().nullable(),
  ultimoResultado: z.enum(ResultadoRegistro).nullable(),
});

export const clienteSyncResultSchema = z.strictObject({
  codigo: z.string(),
  status: z.enum(StatusCliente),
});

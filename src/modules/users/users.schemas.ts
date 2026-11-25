import { Papel } from "../../shared/database/generated/enums.js";
import { z } from "../../shared/http/openapi-zod.js";

export const userIdSchema = z.object({ id: z.uuid() });

export const createUserSchema = z.strictObject({
  nome: z.string().trim().min(1),
  email: z.email(),
  senha: z.string().min(1),
  papel: z.enum(Papel),
  codigoVendedor: z.string().trim().min(1).nullable().optional(),
});

export const updateUserSchema = z
  .strictObject({
    nome: z.string().trim().min(1).optional(),
    papel: z.enum(Papel).optional(),
    ativo: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one property must be provided.",
  );

export const resetPasswordSchema = z.strictObject({
  senha: z.string().min(1),
});

export const userSchema = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  papel: z.enum(Papel),
  ativo: z.boolean(),
  codigoVendedor: z.string().nullable(),
});

export const userListSchema = z.array(userSchema);

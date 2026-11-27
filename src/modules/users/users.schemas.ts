import { Papel } from "../../shared/database/generated/enums.js";
import { z } from "../../shared/http/openapi-zod.js";

export const userIdSchema = z.object({ id: z.uuid() });

// Emails are stored and compared trimmed and in lowercase.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .openapi({ format: "email" });
const newPasswordSchema = z.string().min(8);

export const createUserSchema = z
  .strictObject({
    nome: z.string().trim().min(1),
    email: emailSchema,
    senha: newPasswordSchema,
    papel: z.enum(Papel),
    codigoVendedor: z.string().trim().min(1).nullable().optional(),
  })
  .refine((user) => user.papel !== "VENDEDOR" || Boolean(user.codigoVendedor), {
    message: "A salesperson needs a salesperson code.",
    path: ["codigoVendedor"],
  });

export const updateUserSchema = z
  .strictObject({
    nome: z.string().trim().min(1).optional(),
    papel: z.enum(Papel).optional(),
    ativo: z.boolean().optional(),
    codigoVendedor: z.string().trim().min(1).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one property must be provided.",
  );

export const resetPasswordSchema = z.strictObject({
  senha: newPasswordSchema,
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

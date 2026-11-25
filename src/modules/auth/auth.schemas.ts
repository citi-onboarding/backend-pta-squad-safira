import { Papel } from "../../shared/database/generated/enums.js";
import { z } from "../../shared/http/openapi-zod.js";

export const signInSchema = z.strictObject({
  email: z.email(),
  senha: z.string().min(1),
});

export const currentUserSchema = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  papel: z.enum(Papel),
});

export type SignInInput = z.infer<typeof signInSchema>;

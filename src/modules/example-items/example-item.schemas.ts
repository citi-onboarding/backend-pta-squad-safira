import { z } from "../../shared/http/openapi-zod.js";

export const exampleItemIdSchema = z.object({ id: z.uuid() });

export const createExampleItemSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
});

export const updateExampleItemSchema = createExampleItemSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one property must be provided.",
  );

export const exampleItemSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const exampleItemListSchema = z.array(exampleItemSchema);

export type CreateExampleItemInput = z.infer<typeof createExampleItemSchema>;
export type UpdateExampleItemInput = z.infer<typeof updateExampleItemSchema>;

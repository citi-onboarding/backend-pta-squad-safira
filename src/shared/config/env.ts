import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SERVER_HOST: z.string().min(1).default("0.0.0.0"),
  SERVER_PORT: z.coerce.number().int().positive().max(65_535).default(3001),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  ERP_API_URL: z.url(),
  ERP_API_KEY: z.string().min(1),
});

export type Environment = z.infer<typeof envSchema> & { corsOrigins: string[] };

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const parsed = envSchema.parse(input);
  const corsOrigins = parsed.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0) {
    throw new Error("CORS_ORIGINS must contain at least one origin.");
  }

  return { ...parsed, corsOrigins };
}

export const env = parseEnvironment(process.env);

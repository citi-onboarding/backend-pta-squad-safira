import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../config/env.js";
import { PrismaClient } from "./generated/client.js";

export function createDatabase(databaseUrl = env.DATABASE_URL): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export type Database = ReturnType<typeof createDatabase>;

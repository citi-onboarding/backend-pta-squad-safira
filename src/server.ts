import "dotenv/config";

import { createServer } from "node:http";

import { createApp } from "./app/create-app.js";
import { env } from "./shared/config/env.js";
import { createDatabase } from "./shared/database/create-database.js";
import { createErpClient } from "./shared/erp/erp-client.service.js";
import { createLogger } from "./shared/logging/logger.js";

const database = createDatabase();
const logger = createLogger(env);
const erpClient = createErpClient({
  baseUrl: env.ERP_API_URL,
  apiKey: env.ERP_API_KEY,
  logger,
});
const app = createApp({ database, environment: env, erpClient });
const server = createServer(app);

server.listen(env.SERVER_PORT, env.SERVER_HOST, () => {
  logger.info(
    { host: env.SERVER_HOST, port: env.SERVER_PORT },
    "Server listening",
  );
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "Graceful shutdown started");
  server.close(async (error) => {
    await database.$disconnect();
    if (error) {
      logger.error({ err: error }, "Server shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

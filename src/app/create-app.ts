import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";

import { PrismaAuthRepository } from "../modules/auth/auth.repository.js";
import { createAuthRouter } from "../modules/auth/auth.router.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { PrismaUsersRepository } from "../modules/users/users.repository.js";
import { createUsersRouter } from "../modules/users/users.router.js";
import { UsersService } from "../modules/users/users.service.js";
import type { Environment } from "../shared/config/env.js";
import type { Database } from "../shared/database/create-database.js";
import { createOpenApiDocument } from "../shared/http/openapi.js";
import { notFoundHandler, problemHandler } from "../shared/http/problem.js";
import { createAuthenticate } from "../shared/http/require-role.js";
import { createLogger } from "../shared/logging/logger.js";
import { hashPassword, verifyPassword } from "../shared/security/password.js";

interface CreateAppOptions {
  database: Database;
  environment: Environment;
  signInAttemptsPerMinute?: number | undefined;
}

export function createApp({
  database,
  environment,
  signInAttemptsPerMinute,
}: CreateAppOptions): Express {
  const app = express();
  const logger = createLogger(environment);
  const openApiDocument = createOpenApiDocument();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      genReqId: (request, response) => {
        const requestId =
          request.headers["x-request-id"]?.toString() ?? randomUUID();
        response.setHeader("x-request-id", requestId);
        return requestId;
      },
      serializers: {
        req: (request: IncomingMessage & { id?: unknown }) => ({
          id: request.id,
          method: request.method,
          url: request.url,
        }),
        res: (response: ServerResponse) => ({
          statusCode: response.statusCode,
        }),
      },
    }),
  );
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        callback(null, !origin || environment.corsOrigins.includes(origin));
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  if (environment.NODE_ENV !== "test") {
    app.use(
      rateLimit({
        windowMs: 60_000,
        limit: 100,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );
  }

  app.get("/health/live", (_request, response) =>
    response.json({ status: "ok" }),
  );
  app.get("/health/ready", async (_request, response) => {
    try {
      await database.$queryRaw`SELECT 1`;
      response.json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "not-ready" });
    }
  });
  app.get("/openapi.json", (_request, response) =>
    response.json(openApiDocument),
  );
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  const secureCookie = environment.NODE_ENV === "production";
  const authRepository = new PrismaAuthRepository(database);
  const authenticate = createAuthenticate({
    secret: environment.SESSION_SECRET,
    secureCookie,
    findUserById: (id) => authRepository.findSessionUser(id),
  });
  app.use(
    "/auth",
    createAuthRouter({
      authService: new AuthService(authRepository, verifyPassword),
      authenticate,
      sessionSecret: environment.SESSION_SECRET,
      secureCookie,
      signInAttemptsPerMinute,
    }),
  );
  app.use(
    "/users",
    createUsersRouter({
      usersService: new UsersService(
        new PrismaUsersRepository(database),
        hashPassword,
      ),
      authenticate,
    }),
  );
  app.use(notFoundHandler);
  app.use(problemHandler);

  return app;
}

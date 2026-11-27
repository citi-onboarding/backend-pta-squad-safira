import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { RequestHandler, Router as ExpressRouter } from "express";

import { HttpProblem } from "../../shared/http/problem.js";
import {
  clearSessionCookie,
  setSessionCookie,
} from "../../shared/http/require-role.js";
import { validate } from "../../shared/http/validate.js";
import { createSessionToken } from "../../shared/security/session-token.js";
import { currentUserSchema, signInSchema } from "./auth.schemas.js";
import type { AuthService } from "./auth.service.js";
import "./auth.openapi.js";

interface AuthRouterOptions {
  authService: AuthService;
  authenticate: RequestHandler;
  sessionSecret: string;
  secureCookie: boolean;
  signInAttemptsPerMinute?: number | undefined;
}

const DEFAULT_SIGN_IN_ATTEMPTS_PER_MINUTE = 10;

export function createAuthRouter({
  authService,
  authenticate,
  sessionSecret,
  secureCookie,
  signInAttemptsPerMinute = DEFAULT_SIGN_IN_ATTEMPTS_PER_MINUTE,
}: AuthRouterOptions): ExpressRouter {
  const router = Router();
  // Counts every attempt, successful or not, per IP address. Unlike the global
  // limit, it also runs in tests, so the limit itself is tested.
  const signInLimit = rateLimit({
    windowMs: 60_000,
    limit: signInAttemptsPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.post(
    "/login",
    signInLimit,
    validate({ body: signInSchema }),
    async (request, response) => {
      const { email, senha } = signInSchema.parse(request.body);
      const user = await authService.signIn(email, senha);

      if (user === null) {
        request.log.warn("Sign-in failed");
        throw new HttpProblem(
          401,
          "Unauthorized",
          "Invalid email or password.",
        );
      }

      const token = await createSessionToken({
        userId: user.id,
        secret: sessionSecret,
      });
      setSessionCookie(response, token, secureCookie);
      response.json(currentUserSchema.parse(user));
    },
  );

  router.post("/logout", (_request, response) => {
    clearSessionCookie(response, secureCookie);
    response.status(204).send();
  });

  router.get("/me", authenticate, (request, response) => {
    const user = request.user;
    response.json(
      currentUserSchema.parse({
        id: user?.id,
        nome: user?.nome,
        papel: user?.papel,
      }),
    );
  });

  return router;
}

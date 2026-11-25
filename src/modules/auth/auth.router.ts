import { Router } from "express";
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
}

export function createAuthRouter({
  authService,
  authenticate,
  sessionSecret,
  secureCookie,
}: AuthRouterOptions): ExpressRouter {
  const router = Router();

  router.post(
    "/login",
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

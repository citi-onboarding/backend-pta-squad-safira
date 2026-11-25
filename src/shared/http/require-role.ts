import type { RequestHandler } from "express";

import type { Papel } from "../database/generated/enums.js";
import {
  createSessionToken,
  readSessionToken,
  SESSION_DURATION_MS,
} from "../security/session-token.js";
import { HttpProblem } from "./problem.js";

export const SESSION_COOKIE_NAME = "distrilux_session";

export interface SessionUser {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  codigoVendedor: string | null;
}

export interface AuthenticateOptions {
  secret: string;
  secureCookie: boolean;
  findUserById: (id: string) => Promise<SessionUser | null>;
  now?: () => Date;
}

export interface PortfolioUser {
  papel: Papel;
  codigoVendedor: string | null;
}

const rolesWithEveryPortfolio: readonly Papel[] = ["GERENTE", "FINANCEIRO"];

function unauthorized(): HttpProblem {
  return new HttpProblem(401, "Unauthorized", "A valid session is required.");
}

export function createAuthenticate({
  secret,
  secureCookie,
  findUserById,
  now = () => new Date(),
}: AuthenticateOptions): RequestHandler {
  return async (request, response, next) => {
    const cookies = request.cookies as Record<string, unknown>;
    const token = cookies[SESSION_COOKIE_NAME];
    if (typeof token !== "string") {
      next(unauthorized());
      return;
    }

    const requestTime = now();
    const userId = await readSessionToken({ token, secret, now: requestTime });
    if (userId === null) {
      next(unauthorized());
      return;
    }

    const user = await findUserById(userId);
    if (!user?.ativo) {
      next(unauthorized());
      return;
    }

    const renewedToken = await createSessionToken({
      userId: user.id,
      secret,
      now: requestTime,
    });
    response.cookie(SESSION_COOKIE_NAME, renewedToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge: SESSION_DURATION_MS,
    });
    request.user = user;
    next();
  };
}

export function requireRole(...allowedRoles: Papel[]): RequestHandler {
  return (request, _response, next) => {
    if (request.user === undefined) {
      next(unauthorized());
      return;
    }

    if (!allowedRoles.includes(request.user.papel)) {
      next(
        new HttpProblem(
          403,
          "Forbidden",
          "Your role does not allow this action.",
        ),
      );
      return;
    }

    next();
  };
}

export function canAccessClient(
  user: PortfolioUser,
  clientSalespersonCode: string | null,
): boolean {
  if (rolesWithEveryPortfolio.includes(user.papel)) {
    return true;
  }

  if (user.papel !== "VENDEDOR" || user.codigoVendedor === null) {
    return false;
  }

  return user.codigoVendedor === clientSalespersonCode;
}

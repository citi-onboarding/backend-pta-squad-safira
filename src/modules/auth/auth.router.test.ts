import cookieParser from "cookie-parser";
import express from "express";
import type { Logger } from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { problemHandler } from "../../shared/http/problem.js";
import type { SessionUser } from "../../shared/http/require-role.js";
import {
  createAuthenticate,
  SESSION_COOKIE_NAME,
} from "../../shared/http/require-role.js";
import { createSessionToken } from "../../shared/security/session-token.js";
import { createAuthRouter } from "./auth.router.js";
import type { AuthService } from "./auth.service.js";

const secret = "a-test-secret-that-is-long-enough-for-hs256";
const userId = "6a1f3c2e-8b7d-4e5f-9a0b-1c2d3e4f5a6b";

const patricia: SessionUser = {
  id: userId,
  nome: "Patrícia",
  papel: "VENDEDOR",
  ativo: true,
  codigoVendedor: "V01",
};

function createTestApp() {
  const signIn = vi.fn((email: string, senha: string) =>
    Promise.resolve(
      email === "patricia@distrilux.com.br" && senha === "right-password"
        ? { id: userId, nome: "Patrícia", papel: "VENDEDOR" as const }
        : null,
    ),
  );
  const logger = { warn: vi.fn() };

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.log = logger as unknown as Logger;
    next();
  });
  app.use(
    "/auth",
    createAuthRouter({
      authService: { signIn } as unknown as AuthService,
      authenticate: createAuthenticate({
        secret,
        secureCookie: false,
        findUserById: (id) => Promise.resolve(id === userId ? patricia : null),
      }),
      sessionSecret: secret,
      secureCookie: false,
    }),
  );
  app.use(problemHandler);

  return { app, logger };
}

describe("POST /auth/login", () => {
  it("signs in and sets an HttpOnly, SameSite session cookie", async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post("/auth/login")
      .send({ email: "patricia@distrilux.com.br", senha: "right-password" })
      .expect(200);

    expect(response.body).toEqual({
      id: userId,
      nome: "Patrícia",
      papel: "VENDEDOR",
    });
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("responds 401 with a generic message and no cookie for wrong credentials", async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post("/auth/login")
      .send({ email: "patricia@distrilux.com.br", senha: "wrong-password" })
      .expect(401);

    expect(response.body.detail).toBe("Invalid email or password.");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("logs a failed sign-in without the email or the password", async () => {
    const { app, logger } = createTestApp();

    await request(app)
      .post("/auth/login")
      .send({ email: "patricia@distrilux.com.br", senha: "wrong-password" })
      .expect(401);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toContain("patricia@distrilux.com.br");
    expect(logged).not.toContain("wrong-password");
  });

  it("responds 400 when the email is invalid or the password is missing", async () => {
    const { app } = createTestApp();

    await request(app)
      .post("/auth/login")
      .send({ email: "not-an-email" })
      .expect(400);
  });
});

describe("POST /auth/logout", () => {
  it("responds 204 and removes the session cookie", async () => {
    const { app } = createTestApp();

    const response = await request(app).post("/auth/logout").expect(204);

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970");
  });
});

describe("GET /auth/me", () => {
  it("returns only id, nome, and papel of the signed-in user", async () => {
    const { app } = createTestApp();
    const token = await createSessionToken({ userId, secret });

    const response = await request(app)
      .get("/auth/me")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${token}`)
      .expect(200);

    expect(response.body).toEqual({
      id: userId,
      nome: "Patrícia",
      papel: "VENDEDOR",
    });
  });

  it("responds 401 without a session", async () => {
    const { app } = createTestApp();

    await request(app).get("/auth/me").expect(401);
  });
});

describe("POST /auth/login normalization and limit", () => {
  it("signs in with the email typed in different letter case and with spaces", async () => {
    const { app } = createTestApp();

    await request(app)
      .post("/auth/login")
      .send({ email: "  Patricia@Distrilux.COM.br ", senha: "right-password" })
      .expect(200);
  });

  it("answers 10 attempts per minute normally and responds 429 to the 11th", async () => {
    const { app } = createTestApp();
    const attempt = () =>
      request(app)
        .post("/auth/login")
        .send({ email: "patricia@distrilux.com.br", senha: "wrong-password" });

    for (let index = 0; index < 10; index += 1) {
      await attempt().expect(401);
    }

    await attempt().expect(429);
  });
});

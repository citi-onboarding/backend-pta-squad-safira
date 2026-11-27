import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createSessionToken } from "../security/session-token.js";
import { problemHandler } from "./problem.js";
import type { SessionUser } from "./require-role.js";
import {
  canAccessClient,
  clientPortfolioFilter,
  createAuthenticate,
  requireRole,
  SESSION_COOKIE_NAME,
} from "./require-role.js";

const secret = "a-test-secret-that-is-long-enough-for-hs256";
const signedInAt = new Date("2026-11-24T10:00:00.000Z");
const eightHoursInSeconds = 8 * 60 * 60;

const patricia: SessionUser = {
  id: "user-1",
  nome: "Patrícia",
  papel: "VENDEDOR",
  ativo: true,
  codigoVendedor: "V01",
};

function hoursAfterSignIn(hours: number): Date {
  return new Date(signedInAt.getTime() + hours * 60 * 60 * 1000);
}

function createTestApp(
  storedUser: SessionUser | null,
  requestTime: Date = signedInAt,
) {
  const app = express();
  app.use(cookieParser());
  const authenticate = createAuthenticate({
    secret,
    secureCookie: false,
    findUserById: (id) =>
      Promise.resolve(storedUser?.id === id ? storedUser : null),
    now: () => requestTime,
  });

  app.get("/me", authenticate, (req, res) => {
    res.json({ papel: req.user?.papel });
  });
  app.get(
    "/finance-only",
    authenticate,
    requireRole("FINANCEIRO"),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.use(problemHandler);

  return app;
}

async function sessionCookie(userId = "user-1"): Promise<string> {
  const token = await createSessionToken({ userId, secret, now: signedInAt });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("authentication middleware", () => {
  it("responds 401 when the request has no session cookie", async () => {
    await request(createTestApp(patricia)).get("/me").expect(401);
  });

  it("responds 401 when the session cookie is not a valid token", async () => {
    await request(createTestApp(patricia))
      .get("/me")
      .set("Cookie", `${SESSION_COOKIE_NAME}=not-a-token`)
      .expect(401);
  });

  it("responds 401 when the session is more than 8 hours old", async () => {
    await request(createTestApp(patricia, hoursAfterSignIn(8.1)))
      .get("/me")
      .set("Cookie", await sessionCookie())
      .expect(401);
  });

  it("responds 401 when the user no longer exists", async () => {
    await request(createTestApp(null))
      .get("/me")
      .set("Cookie", await sessionCookie())
      .expect(401);
  });

  it("responds 401 when the user was deactivated", async () => {
    await request(createTestApp({ ...patricia, ativo: false }))
      .get("/me")
      .set("Cookie", await sessionCookie())
      .expect(401);
  });

  it("accepts a valid session and uses the role stored in the database", async () => {
    const response = await request(
      createTestApp({ ...patricia, papel: "GERENTE" }),
    )
      .get("/me")
      .set("Cookie", await sessionCookie())
      .expect(200);

    expect(response.body).toEqual({ papel: "GERENTE" });
  });

  it("renews the session cookie for another 8 hours", async () => {
    const response = await request(createTestApp(patricia, hoursAfterSignIn(7)))
      .get("/me")
      .set("Cookie", await sessionCookie())
      .expect(200);

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain(`Max-Age=${String(eightHoursInSeconds)}`);
  });
});

describe("role guard", () => {
  it("responds 403 when the role is not allowed", async () => {
    await request(createTestApp(patricia))
      .get("/finance-only")
      .set("Cookie", await sessionCookie())
      .expect(403);
  });

  it("accepts a role that is allowed", async () => {
    await request(createTestApp({ ...patricia, papel: "FINANCEIRO" }))
      .get("/finance-only")
      .set("Cookie", await sessionCookie())
      .expect(200, { ok: true });
  });

  it("responds 401 when it runs without the authentication middleware", async () => {
    const app = express();
    app.get("/finance-only", requireRole("FINANCEIRO"), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(problemHandler);

    await request(app).get("/finance-only").expect(401);
  });

  it("responds 401 on a protected route without a session", async () => {
    await request(createTestApp(patricia)).get("/finance-only").expect(401);
  });
});

describe("salesperson portfolio", () => {
  it("allows a salesperson to access a client from the own portfolio", () => {
    expect(
      canAccessClient({ papel: "VENDEDOR", codigoVendedor: "V01" }, "V01"),
    ).toBe(true);
  });

  it("denies a salesperson access to a client from another portfolio", () => {
    expect(
      canAccessClient({ papel: "VENDEDOR", codigoVendedor: "V01" }, "V02"),
    ).toBe(false);
  });

  it("allows the sales manager to access a client of any portfolio", () => {
    expect(
      canAccessClient({ papel: "GERENTE", codigoVendedor: null }, "V02"),
    ).toBe(true);
  });

  it("allows the finance role to access a client of any portfolio", () => {
    expect(
      canAccessClient({ papel: "FINANCEIRO", codigoVendedor: null }, "V02"),
    ).toBe(true);
  });

  it("denies a salesperson without a code access to a client with a salesperson", () => {
    expect(
      canAccessClient({ papel: "VENDEDOR", codigoVendedor: null }, "V01"),
    ).toBe(false);
  });

  it("denies a salesperson without a code access to a client without a salesperson", () => {
    expect(
      canAccessClient({ papel: "VENDEDOR", codigoVendedor: null }, null),
    ).toBe(false);
  });

  it("denies the administrator access to clients", () => {
    expect(
      canAccessClient({ papel: "ADMINISTRADOR", codigoVendedor: null }, "V01"),
    ).toBe(false);
  });
});

describe("salesperson portfolio filter for client lists", () => {
  it("limits a salesperson to the clients with their own code", () => {
    expect(
      clientPortfolioFilter({ papel: "VENDEDOR", codigoVendedor: "V01" }),
    ).toEqual({ codigoVendedor: "V01" });
  });

  it.each(["GERENTE", "FINANCEIRO"] as const)(
    "includes the clients of every portfolio for %s",
    (papel) => {
      expect(clientPortfolioFilter({ papel, codigoVendedor: null })).toEqual(
        {},
      );
    },
  );

  it("includes no client for a salesperson without a code", () => {
    expect(
      clientPortfolioFilter({ papel: "VENDEDOR", codigoVendedor: null }),
    ).toBeNull();
  });

  it("includes no client for the administrator", () => {
    expect(
      clientPortfolioFilter({ papel: "ADMINISTRADOR", codigoVendedor: "V01" }),
    ).toBeNull();
  });
});

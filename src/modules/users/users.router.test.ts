import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { Papel } from "../../shared/database/generated/enums.js";
import { problemHandler } from "../../shared/http/problem.js";
import {
  createAuthenticate,
  SESSION_COOKIE_NAME,
} from "../../shared/http/require-role.js";
import { createSessionToken } from "../../shared/security/session-token.js";
import { createUsersRouter } from "./users.router.js";
import type { UserRecord, UsersService } from "./users.service.js";
import { UserConflictError } from "./users.service.js";

const secret = "a-test-secret-that-is-long-enough-for-hs256";
const signedInUserId = "0b6f1c2a-3d4e-4f5a-8b9c-0d1e2f3a4b5c";
const patriciaId = "6a1f3c2e-8b7d-4e5f-9a0b-1c2d3e4f5a6b";
const unknownId = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

const patricia: UserRecord = {
  id: patriciaId,
  nome: "Patrícia",
  email: "patricia@distrilux.com.br",
  papel: "VENDEDOR",
  ativo: true,
  codigoVendedor: "V01",
};

function createTestApp(signedInRole: Papel = "ADMINISTRADOR") {
  const usersService = {
    list: vi.fn().mockResolvedValue([patricia]),
    create: vi.fn((input: { email: string; codigoVendedor?: string | null }) =>
      input.email === patricia.email
        ? Promise.reject(new UserConflictError("email"))
        : Promise.resolve({
            ...patricia,
            id: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
            email: input.email,
            codigoVendedor: input.codigoVendedor ?? null,
          }),
    ),
    update: vi.fn((id: string, changes: Partial<UserRecord>) =>
      Promise.resolve(id === patriciaId ? { ...patricia, ...changes } : null),
    ),
    resetPassword: vi.fn((id: string) => Promise.resolve(id === patriciaId)),
  };

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    "/users",
    createUsersRouter({
      usersService: usersService as unknown as UsersService,
      authenticate: createAuthenticate({
        secret,
        secureCookie: false,
        findUserById: () =>
          Promise.resolve({
            id: signedInUserId,
            nome: "Lucas",
            papel: signedInRole,
            ativo: true,
            codigoVendedor: null,
          }),
      }),
    }),
  );
  app.use(problemHandler);

  return { app, usersService };
}

async function sessionCookie(): Promise<string> {
  const token = await createSessionToken({ userId: signedInUserId, secret });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

const newSeller = {
  nome: "Juliana",
  email: "juliana@distrilux.com.br",
  senha: "initial-password",
  papel: "VENDEDOR",
  codigoVendedor: "V02",
};

describe("access to user management", () => {
  it("responds 401 without a session", async () => {
    const { app } = createTestApp();

    await request(app).get("/users").expect(401);
  });

  it.each(["VENDEDOR", "GERENTE", "FINANCEIRO"] as const)(
    "responds 403 to the %s role",
    async (role) => {
      const { app } = createTestApp(role);

      await request(app)
        .get("/users")
        .set("Cookie", await sessionCookie())
        .expect(403);
    },
  );
});

describe("GET /users", () => {
  it("lists users without any password field", async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .get("/users")
      .set("Cookie", await sessionCookie())
      .expect(200);

    expect(response.body).toEqual([patricia]);
    expect(JSON.stringify(response.body)).not.toContain("senha");
  });
});

describe("POST /users", () => {
  it("creates a user and never returns the password", async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post("/users")
      .set("Cookie", await sessionCookie())
      .send(newSeller)
      .expect(201);

    expect(response.body).toMatchObject({
      email: "juliana@distrilux.com.br",
      codigoVendedor: "V02",
    });
    expect(JSON.stringify(response.body)).not.toContain("senha");
  });

  it("creates a salesperson without a salesperson code", async () => {
    const { app } = createTestApp();
    const withoutCode = { ...newSeller, codigoVendedor: undefined };

    const response = await request(app)
      .post("/users")
      .set("Cookie", await sessionCookie())
      .send(withoutCode)
      .expect(201);

    expect(response.body.codigoVendedor).toBeNull();
  });

  it("responds 409 for an email that is already registered", async () => {
    const { app } = createTestApp();

    await request(app)
      .post("/users")
      .set("Cookie", await sessionCookie())
      .send({ ...newSeller, email: patricia.email })
      .expect(409);
  });

  it.each([
    ["an invalid email", { email: "not-an-email" }],
    ["an empty name", { nome: "" }],
    ["an empty password", { senha: "" }],
  ])("responds 400 for %s", async (_case, change) => {
    const { app, usersService } = createTestApp();

    await request(app)
      .post("/users")
      .set("Cookie", await sessionCookie())
      .send({ ...newSeller, ...change })
      .expect(400);
    expect(usersService.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /users/:id", () => {
  it("changes the role and the active flag", async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .patch(`/users/${patriciaId}`)
      .set("Cookie", await sessionCookie())
      .send({ papel: "GERENTE", ativo: false })
      .expect(200);

    expect(response.body).toMatchObject({ papel: "GERENTE", ativo: false });
  });

  it("responds 404 for an unknown user", async () => {
    const { app } = createTestApp();

    await request(app)
      .patch(`/users/${unknownId}`)
      .set("Cookie", await sessionCookie())
      .send({ ativo: false })
      .expect(404);
  });

  it("responds 400 when there is nothing to change", async () => {
    const { app } = createTestApp();

    await request(app)
      .patch(`/users/${patriciaId}`)
      .set("Cookie", await sessionCookie())
      .send({})
      .expect(400);
  });
});

describe("POST /users/:id/redefinir-senha", () => {
  it("responds 204 after setting the new password", async () => {
    const { app, usersService } = createTestApp();

    await request(app)
      .post(`/users/${patriciaId}/redefinir-senha`)
      .set("Cookie", await sessionCookie())
      .send({ senha: "new-password" })
      .expect(204);
    expect(usersService.resetPassword).toHaveBeenCalledWith(
      patriciaId,
      "new-password",
    );
  });

  it("responds 404 for an unknown user", async () => {
    const { app } = createTestApp();

    await request(app)
      .post(`/users/${unknownId}/redefinir-senha`)
      .set("Cookie", await sessionCookie())
      .send({ senha: "new-password" })
      .expect(404);
  });
});

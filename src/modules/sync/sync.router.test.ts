import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { Papel } from "../../shared/database/generated/enums.js";
import { ErpIndisponivelError } from "../../shared/erp/erp-client.service.js";
import { problemHandler } from "../../shared/http/problem.js";
import {
  createAuthenticate,
  SESSION_COOKIE_NAME,
} from "../../shared/http/require-role.js";
import { createSessionToken } from "../../shared/security/session-token.js";
import { createSyncRouter } from "./sync.router.js";
import type { SyncService } from "./sync.service.js";
import {
  ClienteNotFoundInErpError,
  SyncInProgressError,
} from "./sync.service.js";

const secret = "a-test-secret-that-is-long-enough-for-hs256";
const userId = "0b6f1c2a-3d4e-4f5a-8b9c-0d1e2f3a4b5c";

function createTestApp(role: Papel = "ADMINISTRADOR") {
  const syncService = {
    status: vi.fn().mockResolvedValue({
      ultimaSincronizacaoOk: new Date("2026-11-27T10:03:00.000Z"),
      ultimoResultado: "SUCESSO",
    }),
    syncCliente: vi
      .fn()
      .mockResolvedValue({ codigo: "C001", status: "BLOQUEADO" }),
  };

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    "/sync",
    createSyncRouter({
      syncService: syncService as unknown as SyncService,
      authenticate: createAuthenticate({
        secret,
        secureCookie: false,
        findUserById: () =>
          Promise.resolve({
            id: userId,
            nome: "Pessoa",
            papel: role,
            ativo: true,
            codigoVendedor: role === "VENDEDOR" ? "V01" : null,
          }),
      }),
    }),
  );
  app.use(problemHandler);

  return { app, syncService };
}

async function sessionCookie(): Promise<string> {
  const token = await createSessionToken({ userId, secret });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("GET /sync/status", () => {
  it("responds 401 without a session", async () => {
    const { app } = createTestApp();

    await request(app).get("/sync/status").expect(401);
  });

  it("returns the status to any signed-in role", async () => {
    const { app } = createTestApp("VENDEDOR");

    const response = await request(app)
      .get("/sync/status")
      .set("Cookie", await sessionCookie())
      .expect(200);

    expect(response.body).toEqual({
      ultimaSincronizacaoOk: "2026-11-27T10:03:00.000Z",
      ultimoResultado: "SUCESSO",
    });
  });

  it("returns nulls before any run", async () => {
    const { app, syncService } = createTestApp();
    syncService.status.mockResolvedValueOnce({
      ultimaSincronizacaoOk: null,
      ultimoResultado: null,
    });

    const response = await request(app)
      .get("/sync/status")
      .set("Cookie", await sessionCookie())
      .expect(200);

    expect(response.body).toEqual({
      ultimaSincronizacaoOk: null,
      ultimoResultado: null,
    });
  });
});

describe("POST /sync/clientes/:codigo", () => {
  it("lets an administrator synchronize one client", async () => {
    const { app, syncService } = createTestApp();

    const response = await request(app)
      .post("/sync/clientes/C001")
      .set("Cookie", await sessionCookie())
      .expect(200);

    expect(response.body).toEqual({ codigo: "C001", status: "BLOQUEADO" });
    expect(syncService.syncCliente).toHaveBeenCalledWith("C001");
  });

  it("responds 401 without a session", async () => {
    const { app } = createTestApp();

    await request(app).post("/sync/clientes/C001").expect(401);
  });

  it.each(["VENDEDOR", "GERENTE", "FINANCEIRO"] as const)(
    "responds 403 to the %s role and reads nothing from the ERP",
    async (role) => {
      const { app, syncService } = createTestApp(role);

      await request(app)
        .post("/sync/clientes/C001")
        .set("Cookie", await sessionCookie())
        .expect(403);
      expect(syncService.syncCliente).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "404 when the ERP no longer has the client",
      new ClienteNotFoundInErpError("C001"),
      404,
    ],
    ["409 when a scheduled run is in progress", new SyncInProgressError(), 409],
    ["503 when the ERP is unavailable", new ErpIndisponivelError(), 503],
  ])("responds %s", async (_case, error, status) => {
    const { app, syncService } = createTestApp();
    syncService.syncCliente.mockRejectedValueOnce(error);

    const response = await request(app)
      .post("/sync/clientes/C001")
      .set("Cookie", await sessionCookie())
      .expect(status);

    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
  });
});

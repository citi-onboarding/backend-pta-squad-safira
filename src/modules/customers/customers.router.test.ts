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
import { createCustomersRouter } from "./customers.router.js";
import type { CustomerPage, CustomerProfile } from "./customers.schemas.js";
import type { CustomersService } from "./customers.service.js";

const secret = "a-test-secret-that-is-long-enough-for-hs256";
const signedInUserId = "0b6f1c2a-3d4e-4f5a-8b9c-0d1e2f3a4b5c";
const exemploId = "6a1f3c2e-8b7d-4e5f-9a0b-1c2d3e4f5a6b";
const otherPortfolioId = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

const page: CustomerPage = {
  itens: [
    {
      id: exemploId,
      codigoErp: "C9001",
      razaoSocial: "Construtora Exemplo Ltda",
      cnpj: "11222333000181",
      cidade: "Recife",
      uf: "PE",
      status: "ATIVO",
      codigoVendedor: "V01",
      vendedorNome: "Patrícia Lima",
      limiteDisponivelCentavos: 1_200_000,
    },
  ],
  total: 1,
  pagina: 1,
  tamanhoPagina: 60,
};

const profile: CustomerProfile = {
  id: exemploId,
  codigoErp: "C9001",
  razaoSocial: "Construtora Exemplo Ltda",
  cnpj: "11222333000181",
  cidade: "Recife",
  uf: "PE",
  segmento: "Construtora",
  status: "BLOQUEADO",
  codigoVendedor: "V01",
  vendedorNome: "Patrícia Lima",
  credito: {
    limiteCreditoCentavos: 2_000_000,
    emAbertoCentavos: 500_000,
    vencidoCentavos: 300_000,
    limiteDisponivelCentavos: 1_200_000,
  },
  titulosVencidos: [],
  ultimoPedidoEm: null,
  ultimaSincronizacao: { clientesEm: null, titulosEm: null },
};

function createTestApp(
  signedInRole: Papel = "VENDEDOR",
  codigoVendedor: string | null = "V01",
) {
  const customersService = {
    search: vi.fn().mockResolvedValue(page),
    getProfile: vi.fn((_filter: unknown, id: string) =>
      Promise.resolve(id === exemploId ? profile : null),
    ),
  };

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    "/clientes",
    createCustomersRouter({
      customersService: customersService as unknown as CustomersService,
      authenticate: createAuthenticate({
        secret,
        secureCookie: false,
        findUserById: () =>
          Promise.resolve({
            id: signedInUserId,
            nome: "Patrícia",
            papel: signedInRole,
            ativo: true,
            codigoVendedor,
          }),
      }),
    }),
  );
  app.use(problemHandler);

  return { app, customersService };
}

async function sessionCookie(): Promise<string> {
  const token = await createSessionToken({ userId: signedInUserId, secret });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("access to clients", () => {
  it.each(["/clientes", `/clientes/${exemploId}`])(
    "responds 401 to %s without a session",
    async (path) => {
      const { app } = createTestApp();

      await request(app).get(path).expect(401);
    },
  );

  it.each(["/clientes", `/clientes/${exemploId}`])(
    "responds 403 to the administrator on %s",
    async (path) => {
      const { app, customersService } = createTestApp("ADMINISTRADOR", null);

      await request(app)
        .get(path)
        .set("Cookie", await sessionCookie())
        .expect(403);
      expect(customersService.search).not.toHaveBeenCalled();
      expect(customersService.getProfile).not.toHaveBeenCalled();
    },
  );

  it("responds 403 to a salesperson without a salesperson code", async () => {
    const { app } = createTestApp("VENDEDOR", null);

    await request(app)
      .get("/clientes")
      .set("Cookie", await sessionCookie())
      .expect(403);
  });
});

describe("GET /clientes", () => {
  it("responds with the page for the salesperson's portfolio", async () => {
    const { app, customersService } = createTestApp("VENDEDOR", "V01");

    const response = await request(app)
      .get("/clientes")
      .query({ busca: "exemplo", pagina: "2" })
      .set("Cookie", await sessionCookie())
      .expect(200);

    expect(response.body).toEqual(page);
    expect(customersService.search).toHaveBeenCalledWith(
      { codigoVendedor: "V01" },
      { busca: "exemplo", pagina: 2 },
    );
  });

  it.each(["GERENTE", "FINANCEIRO"] as const)(
    "searches every portfolio for the %s role",
    async (role) => {
      const { app, customersService } = createTestApp(role, null);

      await request(app)
        .get("/clientes")
        .set("Cookie", await sessionCookie())
        .expect(200);

      expect(customersService.search).toHaveBeenCalledWith({}, { pagina: 1 });
    },
  );

  it.each([
    ["page 0", { pagina: "0" }],
    ["a page that is not a whole number", { pagina: "1.5" }],
    ["a page that is not a number", { pagina: "abc" }],
    ["a term of 101 characters", { busca: "a".repeat(101) }],
    ["a portfolio chosen by the request", { codigoVendedor: "V02" }],
  ])("responds 400 to %s", async (_case, query) => {
    const { app, customersService } = createTestApp();

    await request(app)
      .get("/clientes")
      .query(query)
      .set("Cookie", await sessionCookie())
      .expect(400);
    expect(customersService.search).not.toHaveBeenCalled();
  });
});

describe("GET /clientes/:id", () => {
  it("responds with the profile of a client in the portfolio", async () => {
    const { app, customersService } = createTestApp("VENDEDOR", "V01");

    const response = await request(app)
      .get(`/clientes/${exemploId}`)
      .set("Cookie", await sessionCookie())
      .expect(200);

    expect(response.body).toEqual(profile);
    expect(customersService.getProfile).toHaveBeenCalledWith(
      { codigoVendedor: "V01" },
      exemploId,
    );
  });

  it("responds 404 to a client outside the portfolio", async () => {
    const { app } = createTestApp("VENDEDOR", "V01");

    const response = await request(app)
      .get(`/clientes/${otherPortfolioId}`)
      .set("Cookie", await sessionCookie())
      .expect(404);

    expect(response.body).toMatchObject({ status: 404, title: "Not Found" });
  });

  it("responds 400 to a malformed id", async () => {
    const { app, customersService } = createTestApp();

    await request(app)
      .get("/clientes/not-a-uuid")
      .set("Cookie", await sessionCookie())
      .expect(400);
    expect(customersService.getProfile).not.toHaveBeenCalled();
  });
});

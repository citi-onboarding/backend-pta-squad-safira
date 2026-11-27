import { execFileSync } from "node:child_process";

import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Environment } from "../../shared/config/env.js";
import type { Database } from "../../shared/database/create-database.js";
import type { Papel } from "../../shared/database/generated/enums.js";
import { hashPassword } from "../../shared/security/password.js";

let container: StartedTestContainer;
let database: Database;
let app: ReturnType<(typeof import("../../app/create-app.js"))["createApp"]>;

const password = "integration-password";
const users = {
  patricia: {
    email: "patricia@distrilux.com.br",
    papel: "VENDEDOR",
    codigoVendedor: "V01",
  },
  juliana: {
    email: "juliana@distrilux.com.br",
    papel: "VENDEDOR",
    codigoVendedor: "V02",
  },
  gerente: {
    email: "renata@distrilux.com.br",
    papel: "GERENTE",
    codigoVendedor: null,
  },
  financeiro: {
    email: "sergio@distrilux.com.br",
    papel: "FINANCEIRO",
    codigoVendedor: null,
  },
  admin: {
    email: "lucas@distrilux.com.br",
    papel: "ADMINISTRADOR",
    codigoVendedor: null,
  },
} satisfies Record<
  string,
  { email: string; papel: Papel; codigoVendedor: string | null }
>;

// Dates relative to today in Recife, so the credit position does not depend
// on when the test runs.
function recifeDate(offsetInDays: number): Date {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
  }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetInDays);
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function signInAs(user: keyof typeof users) {
  const agent = request.agent(app);
  await agent
    .post("/auth/login")
    .send({ email: users[user].email, senha: password })
    .expect(200);
  return agent;
}

const clientDefaults = {
  cidade: "Recife",
  uf: "PE",
  segmento: "Construtora",
  status: "ATIVO" as const,
  atualizadoNoErpEm: new Date("2026-11-27T10:00:00Z"),
};

const receivableDefaults = {
  pedidoErp: "PE-1",
  emissao: new Date("2026-10-01T00:00:00Z"),
  status: "EM_ABERTO" as const,
  origem: "ERP" as const,
};

let exemploId: string;
let semTitulosId: string;
let acimaDoLimiteId: string;
const lastClientSync = new Date("2026-11-27T13:00:00.000Z");

describe("customer search and profile with PostgreSQL", () => {
  beforeAll(async () => {
    container = await new GenericContainer("postgres:17-alpine")
      .withEnvironment({
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_DB: "integration",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/),
      )
      .start();
    const databaseUrl = `postgresql://postgres:postgres@${container.getHost()}:${String(container.getMappedPort(5432))}/integration`;
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "pipe",
      },
    );
    const { createDatabase } =
      await import("../../shared/database/create-database.js");
    const { createApp } = await import("../../app/create-app.js");
    database = createDatabase(databaseUrl);

    const senhaHash = await hashPassword(password);
    await database.usuario.createMany({
      data: [
        { nome: "Patrícia Lima", senhaHash, ...users.patricia },
        { nome: "Juliana Freitas", senhaHash, ...users.juliana },
        { nome: "Renata", senhaHash, ...users.gerente },
        { nome: "Sérgio", senhaHash, ...users.financeiro },
        { nome: "Lucas", senhaHash, ...users.admin },
      ],
    });

    const exemplo = await database.cliente.create({
      data: {
        ...clientDefaults,
        codigoErp: "C9001",
        razaoSocial: "Construtora Exemplo Ltda",
        cnpj: "11222333000181",
        codigoVendedor: "V01",
        limiteCreditoCentavos: 2_000_000,
      },
    });
    exemploId = exemplo.id;
    await database.titulo.createMany({
      data: [
        {
          ...receivableDefaults,
          numero: "NF-2001",
          parcela: 1,
          clienteId: exemplo.id,
          valorCentavos: 500_000,
          vencimento: recifeDate(8),
        },
        {
          ...receivableDefaults,
          numero: "NF-1201",
          parcela: 2,
          clienteId: exemplo.id,
          valorCentavos: 300_000,
          vencimento: recifeDate(-10),
          status: "VENCIDO",
        },
        {
          ...receivableDefaults,
          numero: "NF-0901",
          parcela: 1,
          clienteId: exemplo.id,
          valorCentavos: 400_000,
          vencimento: recifeDate(-40),
          pagamento: recifeDate(-41),
          status: "PAGO",
        },
        {
          ...receivableDefaults,
          numero: "PL-0042",
          parcela: 1,
          clienteId: exemplo.id,
          valorCentavos: 400_000,
          vencimento: recifeDate(-90),
          origem: "PLANILHA",
        },
      ],
    });

    const semTitulos = await database.cliente.create({
      data: {
        ...clientDefaults,
        codigoErp: "C9002",
        razaoSocial: "Elétrica Sem Títulos ME",
        cnpj: "22333444000155",
        codigoVendedor: "V01",
        limiteCreditoCentavos: 1_000_000,
      },
    });
    semTitulosId = semTitulos.id;

    const acimaDoLimite = await database.cliente.create({
      data: {
        ...clientDefaults,
        codigoErp: "C9003",
        razaoSocial: "Distribuidora Acima do Limite SA",
        cnpj: "44555666000199",
        codigoVendedor: "V02",
        limiteCreditoCentavos: 1_000_000,
        status: "BLOQUEADO",
      },
    });
    acimaDoLimiteId = acimaDoLimite.id;
    await database.titulo.create({
      data: {
        ...receivableDefaults,
        numero: "NF-3001",
        parcela: 1,
        clienteId: acimaDoLimite.id,
        valorCentavos: 1_250_000,
        vencimento: recifeDate(20),
      },
    });

    // 61 clients of a salesperson without a portal user, for the pagination.
    await database.cliente.createMany({
      data: Array.from({ length: 61 }, (_, index) => {
        const number = String(index + 1).padStart(3, "0");
        return {
          ...clientDefaults,
          codigoErp: `L${number}`,
          razaoSocial: `Loja Paginada ${number}`,
          cnpj: `90000000000${number}`,
          codigoVendedor: "V03",
          limiteCreditoCentavos: 100_000,
        };
      }),
    });

    await database.registroSincronizacao.createMany({
      data: [
        {
          tipo: "SINCRONIZACAO_CLIENTES",
          iniciouEm: new Date("2026-11-27T12:59:00Z"),
          terminouEm: lastClientSync,
          resultado: "SUCESSO",
        },
        {
          tipo: "SINCRONIZACAO_CLIENTES",
          iniciouEm: new Date("2026-11-27T13:59:00Z"),
          terminouEm: new Date("2026-11-27T14:00:00Z"),
          resultado: "FALHA",
        },
      ],
    });

    const environment: Environment = {
      NODE_ENV: "test",
      SERVER_HOST: "0.0.0.0",
      SERVER_PORT: 3001,
      LOG_LEVEL: "silent",
      CORS_ORIGINS: "http://localhost:5173",
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "a-test-secret-that-is-long-enough-for-hs256",
      TRUST_PROXY: 0,
      corsOrigins: ["http://localhost:5173"],
    };
    app = createApp({ database, environment, signInAttemptsPerMinute: 1000 });
  });

  afterAll(async () => {
    await database.$disconnect();
    await container.stop();
  });

  describe("GET /clientes", () => {
    it("shows a salesperson only their own portfolio", async () => {
      const agent = await signInAs("patricia");

      const response = await agent.get("/clientes").expect(200);

      expect(
        response.body.itens.map(
          (item: { codigoErp: string }) => item.codigoErp,
        ),
      ).toEqual(["C9001", "C9002"]);
      expect(response.body.total).toBe(2);
    });

    it.each(["gerente", "financeiro"] as const)(
      "shows every portfolio to the %s",
      async (user) => {
        const agent = await signInAs(user);

        const response = await agent.get("/clientes").expect(200);

        expect(response.body.total).toBe(64);
      },
    );

    it("responds 403 to the administrator", async () => {
      const agent = await signInAs("admin");

      await agent.get("/clientes").expect(403);
    });

    it.each([
      ["a partial name in a different letter case", "exemplo"],
      ["the ERP code", "c9001"],
      ["the CNPJ with punctuation", "11.222.333/0001-81"],
      ["the CNPJ without punctuation", "11222333000181"],
      ["part of the CNPJ", "112223"],
    ])("finds the client by %s", async (_case, term) => {
      const agent = await signInAs("patricia");

      const response = await agent
        .get("/clientes")
        .query({ busca: term })
        .expect(200);

      expect(
        response.body.itens.map(
          (item: { codigoErp: string }) => item.codigoErp,
        ),
      ).toEqual(["C9001"]);
    });

    it("does not find a client of another portfolio, even by its exact CNPJ", async () => {
      const agent = await signInAs("patricia");

      const response = await agent
        .get("/clientes")
        .query({ busca: "44.555.666/0001-99" })
        .expect(200);

      expect(response.body).toMatchObject({ itens: [], total: 0 });
    });

    it("returns an empty page when nothing matches", async () => {
      const agent = await signInAs("gerente");

      const response = await agent
        .get("/clientes")
        .query({ busca: "não existe" })
        .expect(200);

      expect(response.body).toEqual({
        itens: [],
        total: 0,
        pagina: 1,
        tamanhoPagina: 60,
      });
    });

    it("splits 61 matches into a page of 60 and a page of 1, by company name", async () => {
      const agent = await signInAs("gerente");

      const first = await agent
        .get("/clientes")
        .query({ busca: "loja paginada" })
        .expect(200);
      const second = await agent
        .get("/clientes")
        .query({ busca: "loja paginada", pagina: 2 })
        .expect(200);

      expect(first.body.total).toBe(61);
      expect(first.body.itens).toHaveLength(60);
      expect(first.body.itens[0].razaoSocial).toBe("Loja Paginada 001");
      expect(
        second.body.itens.map(
          (item: { razaoSocial: string }) => item.razaoSocial,
        ),
      ).toEqual(["Loja Paginada 061"]);
      expect(second.body.itens[0].vendedorNome).toBeNull();
    });

    it("shows the available credit and the salesperson name in the list", async () => {
      const agent = await signInAs("gerente");

      const response = await agent
        .get("/clientes")
        .query({ busca: "C900" })
        .expect(200);

      expect(response.body.itens).toEqual([
        expect.objectContaining({
          codigoErp: "C9003",
          vendedorNome: "Juliana Freitas",
          limiteDisponivelCentavos: -250_000,
        }),
        expect.objectContaining({
          codigoErp: "C9002",
          vendedorNome: "Patrícia Lima",
          limiteDisponivelCentavos: 1_000_000,
        }),
        expect.objectContaining({
          codigoErp: "C9001",
          vendedorNome: "Patrícia Lima",
          limiteDisponivelCentavos: 1_200_000,
        }),
      ]);
    });
  });

  describe("GET /clientes/:id", () => {
    it("shows the profile with open, overdue, and available credit, ignoring paid and spreadsheet receivables", async () => {
      const agent = await signInAs("patricia");

      const response = await agent.get(`/clientes/${exemploId}`).expect(200);

      expect(response.body).toMatchObject({
        codigoErp: "C9001",
        razaoSocial: "Construtora Exemplo Ltda",
        segmento: "Construtora",
        status: "ATIVO",
        vendedorNome: "Patrícia Lima",
        credito: {
          limiteCreditoCentavos: 2_000_000,
          emAbertoCentavos: 500_000,
          vencidoCentavos: 300_000,
          limiteDisponivelCentavos: 1_200_000,
        },
        titulosVencidos: [
          {
            numero: "NF-1201",
            parcela: 2,
            valorCentavos: 300_000,
            vencimento: isoDate(recifeDate(-10)),
            diasEmAtraso: 10,
          },
        ],
        ultimoPedidoEm: null,
      });
    });

    it("keeps the whole limit for a client without receivables", async () => {
      const agent = await signInAs("patricia");

      const response = await agent.get(`/clientes/${semTitulosId}`).expect(200);

      expect(response.body.credito).toEqual({
        limiteCreditoCentavos: 1_000_000,
        emAbertoCentavos: 0,
        vencidoCentavos: 0,
        limiteDisponivelCentavos: 1_000_000,
      });
      expect(response.body.titulosVencidos).toEqual([]);
    });

    it("shows a negative available credit and the Blocked status", async () => {
      const agent = await signInAs("financeiro");

      const response = await agent
        .get(`/clientes/${acimaDoLimiteId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: "BLOQUEADO",
        credito: { limiteDisponivelCentavos: -250_000 },
      });
    });

    it("responds 404 to a salesperson opening a client of another portfolio, like a missing client", async () => {
      const agent = await signInAs("patricia");

      const otherPortfolio = await agent
        .get(`/clientes/${acimaDoLimiteId}`)
        .expect(404);
      const missing = await agent
        .get("/clientes/00000000-0000-4000-8000-000000000000")
        .expect(404);

      // Only the path and the request id differ between the two answers.
      const sameAnswer = ({
        title,
        status,
        detail,
      }: Record<string, unknown>) => ({
        title,
        status,
        detail,
      });
      expect(sameAnswer(otherPortfolio.body)).toEqual(sameAnswer(missing.body));
    });

    it("shows the end of the last successful client sync and no receivables sync yet", async () => {
      const agent = await signInAs("gerente");

      const response = await agent.get(`/clientes/${exemploId}`).expect(200);

      expect(response.body.ultimaSincronizacao).toEqual({
        clientesEm: lastClientSync.toISOString(),
        titulosEm: null,
      });
    });
  });
});

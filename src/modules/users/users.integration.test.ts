import { execFileSync } from "node:child_process";

import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Environment } from "../../shared/config/env.js";
import type { Database } from "../../shared/database/create-database.js";
import { hashPassword } from "../../shared/security/password.js";

let container: StartedTestContainer;
let database: Database;
let app: ReturnType<(typeof import("../../app/create-app.js"))["createApp"]>;

const admin = { email: "lucas@distrilux.com.br", senha: "admin-password" };

async function signInAsAdmin() {
  const agent = request.agent(app);
  await agent.post("/auth/login").send(admin).expect(200);
  return agent;
}

describe("user management with PostgreSQL", () => {
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
    await database.usuario.create({
      data: {
        nome: "Lucas",
        email: admin.email,
        senhaHash: await hashPassword(admin.senha),
        papel: "ADMINISTRADOR",
      },
    });
    const environment: Environment = {
      NODE_ENV: "test",
      SERVER_HOST: "0.0.0.0",
      SERVER_PORT: 3001,
      LOG_LEVEL: "silent",
      CORS_ORIGINS: "http://localhost:5173",
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "a-test-secret-that-is-long-enough-for-hs256",
      corsOrigins: ["http://localhost:5173"],
    };
    app = createApp({ database, environment });
  });

  afterAll(async () => {
    await database.$disconnect();
    await container.stop();
  });

  it("creates a user who can then sign in, and stores only a hash", async () => {
    const agent = await signInAsAdmin();

    await agent
      .post("/users")
      .send({
        nome: "Juliana",
        email: "juliana@distrilux.com.br",
        senha: "juliana-password",
        papel: "VENDEDOR",
        codigoVendedor: "V02",
      })
      .expect(201);

    const stored = await database.usuario.findUniqueOrThrow({
      where: { email: "juliana@distrilux.com.br" },
    });
    expect(stored.senhaHash.startsWith("$argon2id$")).toBe(true);
    await request(app)
      .post("/auth/login")
      .send({ email: "juliana@distrilux.com.br", senha: "juliana-password" })
      .expect(200);
  });

  it("responds 409 for a repeated email or salesperson code", async () => {
    const agent = await signInAsAdmin();
    const seller = {
      nome: "Marcos",
      email: "marcos@distrilux.com.br",
      senha: "marcos-password",
      papel: "VENDEDOR",
      codigoVendedor: "V03",
    };
    await agent.post("/users").send(seller).expect(201);

    await agent.post("/users").send(seller).expect(409);
    await agent
      .post("/users")
      .send({ ...seller, email: "outro@distrilux.com.br" })
      .expect(409);
  });

  it("deactivates a user, who can no longer sign in", async () => {
    const agent = await signInAsAdmin();
    const created = await agent
      .post("/users")
      .send({
        nome: "Carla",
        email: "carla@distrilux.com.br",
        senha: "carla-password",
        papel: "VENDEDOR",
        codigoVendedor: "V04",
      })
      .expect(201);

    await agent
      .patch(`/users/${String(created.body.id)}`)
      .send({ ativo: false })
      .expect(200);

    await request(app)
      .post("/auth/login")
      .send({ email: "carla@distrilux.com.br", senha: "carla-password" })
      .expect(401);
  });

  it("applies a role change on the user's next request", async () => {
    const agent = await signInAsAdmin();
    const created = await agent
      .post("/users")
      .send({
        nome: "Sérgio",
        email: "sergio@distrilux.com.br",
        senha: "sergio-password",
        papel: "FINANCEIRO",
      })
      .expect(201);
    const sergio = request.agent(app);
    await sergio
      .post("/auth/login")
      .send({ email: "sergio@distrilux.com.br", senha: "sergio-password" })
      .expect(200);
    await sergio.get("/users").expect(403);

    await agent
      .patch(`/users/${String(created.body.id)}`)
      .send({ papel: "ADMINISTRADOR" })
      .expect(200);

    await sergio.get("/users").expect(200);
  });

  it("resets a password so only the new one works", async () => {
    const agent = await signInAsAdmin();
    const created = await agent
      .post("/users")
      .send({
        nome: "Rodrigo",
        email: "rodrigo@distrilux.com.br",
        senha: "old-password",
        papel: "VENDEDOR",
        codigoVendedor: "V05",
      })
      .expect(201);

    await agent
      .post(`/users/${String(created.body.id)}/redefinir-senha`)
      .send({ senha: "new-password" })
      .expect(204);

    await request(app)
      .post("/auth/login")
      .send({ email: "rodrigo@distrilux.com.br", senha: "old-password" })
      .expect(401);
    await request(app)
      .post("/auth/login")
      .send({ email: "rodrigo@distrilux.com.br", senha: "new-password" })
      .expect(200);
  });

  it("lets an administrator create another administrator who can manage users", async () => {
    const agent = await signInAsAdmin();
    await agent
      .post("/users")
      .send({
        nome: "Ana",
        email: "ana@distrilux.com.br",
        senha: "ana-password",
        papel: "ADMINISTRADOR",
      })
      .expect(201);

    const ana = request.agent(app);
    await ana
      .post("/auth/login")
      .send({ email: "ana@distrilux.com.br", senha: "ana-password" })
      .expect(200);
    await ana.get("/users").expect(200);
  });
});

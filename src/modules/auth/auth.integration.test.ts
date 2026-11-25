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

const email = "patricia@distrilux.com.br";
const password = "integration-password";

describe("authentication with PostgreSQL", () => {
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
        nome: "Patrícia",
        email,
        senhaHash: await hashPassword(password),
        papel: "VENDEDOR",
        codigoVendedor: "V01",
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

  it("signs in, returns the current user, and signs out", async () => {
    const agent = request.agent(app);

    await agent
      .post("/auth/login")
      .send({ email, senha: password })
      .expect(200);
    const me = await agent.get("/auth/me").expect(200);
    expect(me.body).toMatchObject({ nome: "Patrícia", papel: "VENDEDOR" });

    await agent.post("/auth/logout").expect(204);
    await agent.get("/auth/me").expect(401);
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ email, senha: "wrong-password" })
      .expect(401);
    const unknownEmail = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@distrilux.com.br", senha: password })
      .expect(401);

    expect(unknownEmail.body.detail).toBe(wrongPassword.body.detail);
  });

  it("blocks a user deactivated during an active session", async () => {
    const agent = request.agent(app);
    await agent
      .post("/auth/login")
      .send({ email, senha: password })
      .expect(200);

    await database.usuario.update({ where: { email }, data: { ativo: false } });

    await agent.get("/auth/me").expect(401);
    await database.usuario.update({ where: { email }, data: { ativo: true } });
  });
});

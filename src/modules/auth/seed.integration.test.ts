import { execFileSync } from "node:child_process";

import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Environment } from "../../shared/config/env.js";
import type { Database } from "../../shared/database/create-database.js";

let container: StartedTestContainer;
let databaseUrl: string;
let database: Database;
let app: ReturnType<(typeof import("../../app/create-app.js"))["createApp"]>;

const seedPassword = "seed-integration-password";
const seededUsers = [
  { email: "fernanda@distrilux.test", papel: "GERENTE", manageUsers: 403 },
  { email: "sergio@distrilux.test", papel: "FINANCEIRO", manageUsers: 403 },
  { email: "lucas@distrilux.test", papel: "ADMINISTRADOR", manageUsers: 200 },
  { email: "patricia@distrilux.test", papel: "VENDEDOR", manageUsers: 403 },
];

function runSeed(password: string) {
  execFileSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, SEED_PASSWORD: password },
    stdio: "pipe",
  });
}

describe("development seed", () => {
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
    databaseUrl = `postgresql://postgres:postgres@${container.getHost()}:${String(container.getMappedPort(5432))}/integration`;
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
    app = createApp({ database, environment });
  });

  afterAll(async () => {
    await database.$disconnect();
    await container.stop();
  });

  it("stops without SEED_PASSWORD and creates no user", async () => {
    expect(() => {
      runSeed("");
    }).toThrow();
    await expect(database.usuario.count()).resolves.toBe(0);
  });

  it("creates one user per role who can sign in, and only the administrator manages users", async () => {
    runSeed(seedPassword);

    for (const { email, papel, manageUsers } of seededUsers) {
      const agent = request.agent(app);
      await agent
        .post("/auth/login")
        .send({ email, senha: seedPassword })
        .expect(200);
      const me = await agent.get("/auth/me").expect(200);
      expect(me.body.papel).toBe(papel);
      await agent.get("/users").expect(manageUsers);
    }
  });
});

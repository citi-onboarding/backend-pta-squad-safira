import { execFileSync } from "node:child_process";

import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Environment } from "../../shared/config/env.js";
import type { Database } from "../../shared/database/create-database.js";

let container: StartedTestContainer;
let database: Database;
let app: ReturnType<(typeof import("../../app/create-app.js"))["createApp"]>;

describe("example items with PostgreSQL", () => {
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
    const databaseUrl = `postgresql://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/integration`;
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
      corsOrigins: ["http://localhost:5173"],
    };
    app = createApp({ database, environment });
  });

  afterAll(async () => {
    await database?.$disconnect();
    await container?.stop();
  });

  it("persists the complete CRUD lifecycle", async () => {
    const created = await request(app)
      .post("/api/v1/example-items")
      .send({ name: "Database item" })
      .expect(201);
    const id = created.body.id as string;
    await request(app).get(`/api/v1/example-items/${id}`).expect(200);
    const updated = await request(app)
      .patch(`/api/v1/example-items/${id}`)
      .send({ description: "Persisted" })
      .expect(200);
    expect(updated.body.description).toBe("Persisted");
    await request(app).delete(`/api/v1/example-items/${id}`).expect(204);
    await request(app).get(`/api/v1/example-items/${id}`).expect(404);
  });
});

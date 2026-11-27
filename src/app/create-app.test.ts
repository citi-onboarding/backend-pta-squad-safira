import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { Environment } from "../shared/config/env.js";
import type { Database } from "../shared/database/create-database.js";
import type { ErpClient } from "../shared/erp/erp-client.service.js";
import { createApp } from "./create-app.js";

const environment: Environment = {
  NODE_ENV: "test",
  SERVER_HOST: "0.0.0.0",
  SERVER_PORT: 3001,
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:5173",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test",
  ERP_API_URL: "https://erp.example.com",
  ERP_API_KEY: "erp-test-key",
  corsOrigins: ["http://localhost:5173"],
};

const erpClient = {} as ErpClient;

function createDatabaseDouble() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  } as unknown as Database;
}

describe("createApp", () => {
  it("serves liveness, readiness, and OpenAPI", async () => {
    const app = createApp({
      database: createDatabaseDouble(),
      environment,
      erpClient,
    });
    await request(app).get("/health/live").expect(200, { status: "ok" });
    await request(app).get("/health/ready").expect(200, { status: "ready" });
    const contract = await request(app).get("/openapi.json").expect(200);
    expect(contract.body.openapi).toBe("3.1.0");
  });

  it("returns 503 when the database is unavailable", async () => {
    const database = createDatabaseDouble();
    vi.mocked(database.$queryRaw).mockRejectedValueOnce(
      new Error("unavailable"),
    );
    await request(createApp({ database, environment, erpClient }))
      .get("/health/ready")
      .expect(503, { status: "not-ready" });
  });

  it("uses Problem Details for unknown requests", async () => {
    const app = createApp({
      database: createDatabaseDouble(),
      environment,
      erpClient,
    });
    const missing = await request(app).get("/unknown").expect(404);
    expect(missing.body).toMatchObject({ title: "Not Found", status: 404 });
  });

  it("applies security and CORS headers", async () => {
    const response = await request(
      createApp({ database: createDatabaseDouble(), environment, erpClient }),
    )
      .get("/health/live")
      .set("x-request-id", "known-request-id")
      .set("origin", "http://localhost:5173")
      .expect(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-request-id"]).toBe("known-request-id");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});

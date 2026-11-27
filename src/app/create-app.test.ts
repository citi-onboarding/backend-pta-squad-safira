import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { Environment } from "../shared/config/env.js";
import type { Database } from "../shared/database/create-database.js";
import { createApp } from "./create-app.js";

const environment: Environment = {
  NODE_ENV: "test",
  SERVER_HOST: "0.0.0.0",
  SERVER_PORT: 3001,
  LOG_LEVEL: "silent",
  CORS_ORIGINS: "http://localhost:5173",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test",
  SESSION_SECRET: "a-test-secret-that-is-long-enough-for-hs256",
  TRUST_PROXY: 0,
  corsOrigins: ["http://localhost:5173"],
};

function createDatabaseDouble() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  } as unknown as Database;
}

describe("createApp", () => {
  it("serves liveness, readiness, and OpenAPI", async () => {
    const app = createApp({ database: createDatabaseDouble(), environment });
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
    await request(createApp({ database, environment }))
      .get("/health/ready")
      .expect(503, { status: "not-ready" });
  });

  it("uses Problem Details for unknown requests", async () => {
    const app = createApp({ database: createDatabaseDouble(), environment });
    const missing = await request(app).get("/unknown").expect(404);
    expect(missing.body).toMatchObject({ title: "Not Found", status: 404 });
  });

  it("applies security and CORS headers", async () => {
    const response = await request(
      createApp({ database: createDatabaseDouble(), environment }),
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

  it("mounts the authentication routes and documents them", async () => {
    const app = createApp({ database: createDatabaseDouble(), environment });

    await request(app).get("/auth/me").expect(401);
    await request(app).post("/auth/login").send({}).expect(400);
    const contract = await request(app).get("/openapi.json").expect(200);
    expect(Object.keys(contract.body.paths)).toEqual(
      expect.arrayContaining(["/auth/login", "/auth/logout", "/auth/me"]),
    );
  });

  it("mounts the user management routes and documents them", async () => {
    const app = createApp({ database: createDatabaseDouble(), environment });

    await request(app).get("/users").expect(401);
    const contract = await request(app).get("/openapi.json").expect(200);
    expect(Object.keys(contract.body.paths)).toEqual(
      expect.arrayContaining([
        "/users",
        "/users/{id}",
        "/users/{id}/redefinir-senha",
      ]),
    );
  });

  describe("sign-in limit by client address", () => {
    const credentials = { email: "nobody@distrilux.test", senha: "wrong" };

    function createLimitedApp(trustedProxies: number) {
      const database = {
        ...createDatabaseDouble(),
        usuario: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as Database;
      return createApp({
        database,
        environment: { ...environment, TRUST_PROXY: trustedProxies },
        signInAttemptsPerMinute: 1,
      });
    }

    function signIn(app: ReturnType<typeof createApp>, forwardedFor: string) {
      return request(app)
        .post("/auth/login")
        .set("x-forwarded-for", forwardedFor)
        .send(credentials);
    }

    it("gives each client behind a trusted proxy its own limit", async () => {
      const app = createLimitedApp(1);

      await signIn(app, "203.0.113.1").expect(401);
      await signIn(app, "203.0.113.1").expect(429);
      await signIn(app, "203.0.113.2").expect(401);
    });

    it("ignores the forwarded address when no proxy is trusted", async () => {
      const app = createLimitedApp(0);

      await signIn(app, "203.0.113.1").expect(401);
      await signIn(app, "203.0.113.2").expect(429);
    });
  });
});

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { notFoundHandler, problemHandler } from "../../shared/http/problem.js";
import { createExampleItemRouter } from "./example-item.router.js";
import type { ExampleItemService } from "./example-item.service.js";

function createServiceDouble() {
  const now = new Date("2026-08-13T12:00:00.000Z");
  const item = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Example",
    description: null,
    createdAt: now,
    updatedAt: now,
  };
  return {
    create: vi.fn().mockResolvedValue(item),
    list: vi.fn().mockResolvedValue([item]),
    get: vi.fn().mockResolvedValue(item),
    update: vi.fn().mockResolvedValue({ ...item, name: "Updated" }),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExampleItemService;
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/example-items",
    createExampleItemRouter(createServiceDouble()),
  );
  app.use(notFoundHandler);
  app.use(problemHandler);
  return app;
}

describe("example item routes", () => {
  it("runs the complete CRUD with request IDs", async () => {
    const app = createTestApp();
    const created = await request(app)
      .post("/api/v1/example-items")
      .send({ name: "Example" })
      .expect(201);
    expect(created.headers.location).toContain(created.body.id);
    await request(app).get("/api/v1/example-items").expect(200);
    await request(app)
      .get(`/api/v1/example-items/${created.body.id}`)
      .expect(200);
    await request(app)
      .patch(`/api/v1/example-items/${created.body.id}`)
      .send({ name: "Updated" })
      .expect(200);
    await request(app)
      .delete(`/api/v1/example-items/${created.body.id}`)
      .expect(204);
  });

  it("returns Problem Details for invalid input", async () => {
    const invalid = await request(createTestApp())
      .post("/api/v1/example-items")
      .send({ name: "" })
      .expect(400);
    expect(invalid.type).toBe("application/problem+json");
    expect(invalid.body).toMatchObject({
      title: "Validation Error",
      status: 400,
    });
  });
});

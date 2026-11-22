import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { HttpProblem, notFoundHandler, problemHandler } from "./problem.js";

function responseDouble() {
  const response = {
    status: vi.fn(),
    type: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.type.mockReturnValue(response);
  return response as unknown as Response;
}

const request = {
  method: "GET",
  path: "/missing",
  originalUrl: "/missing",
  id: "request-id",
  log: { error: vi.fn() },
} as unknown as Request;

describe("problem handlers", () => {
  it("creates a 404 for unknown routes", () => {
    const next = vi.fn();
    notFoundHandler(request, responseDouble(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it("serializes HttpProblem errors", () => {
    const response = responseDouble();
    problemHandler(
      new HttpProblem(409, "Conflict", "Already exists"),
      request,
      response,
      vi.fn(),
    );
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 409, requestId: "request-id" }),
    );
  });

  it("serializes Zod errors without exposing internals", () => {
    const response = responseDouble();
    let error: unknown;
    try {
      z.object({ name: z.string() }).parse({});
    } catch (caught) {
      error = caught;
    }
    problemHandler(error, request, response, vi.fn());
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Validation Error" }),
    );
  });

  it("logs and hides unexpected errors", () => {
    const response = responseDouble();
    problemHandler(new Error("database secret"), request, response, vi.fn());
    expect(request.log.error).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: "An unexpected error occurred." }),
    );
  });
});

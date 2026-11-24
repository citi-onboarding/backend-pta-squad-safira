import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { validate } from "./validate.js";

describe("validate", () => {
  it("parses body, params, and query before continuing", () => {
    const request = {
      body: { count: "2" },
      params: { id: "5" },
      query: { active: "true" },
    } as unknown as Request;
    const next = vi.fn() as NextFunction;

    validate({
      body: z.object({ count: z.coerce.number() }),
      params: z.object({ id: z.coerce.number() }),
      query: z.object({ active: z.coerce.boolean() }),
    })(request, {} as Response, next);

    expect(request.body).toEqual({ count: 2 });
    expect(request.params).toEqual({ id: 5 });
    expect(request.query).toEqual({ active: true });
    expect(next).toHaveBeenCalledOnce();
  });

  it("leaves the request untouched for sections without a schema", () => {
    const request = {
      body: { raw: true },
      params: { id: "5" },
      query: { active: "true" },
    } as unknown as Request;
    const next = vi.fn() as NextFunction;

    validate({})(request, {} as Response, next);

    expect(request.body).toEqual({ raw: true });
    expect(request.params).toEqual({ id: "5" });
    expect(request.query).toEqual({ active: "true" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("throws when the contract is invalid", () => {
    const middleware = validate({
      body: z.object({ name: z.string().min(1) }),
    });
    expect(() =>
      middleware({ body: {} } as Request, {} as Response, vi.fn()),
    ).toThrow();
  });
});

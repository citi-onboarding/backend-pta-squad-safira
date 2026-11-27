import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("redacts credentials", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger({ LOG_LEVEL: "info" }, destination);

    logger.info({ password: "secret", token: "token-value" }, "credentials");
    await new Promise((resolve) => setImmediate(resolve));

    expect(output).not.toContain("secret");
    expect(output).not.toContain("token-value");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts the model key", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger({ LOG_LEVEL: "info" }, destination);

    logger.info({ ANTHROPIC_API_KEY: "model-key-value" }, "model key");
    await new Promise((resolve) => setImmediate(resolve));

    expect(output).not.toContain("model-key-value");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts the Gemini key", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger({ LOG_LEVEL: "info" }, destination);

    logger.info({ GEMINI_API_KEY: "gemini-key-value" }, "gemini key");
    await new Promise((resolve) => setImmediate(resolve));

    expect(output).not.toContain("gemini-key-value");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts the ERP key", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger({ LOG_LEVEL: "info" }, destination);

    logger.info(
      {
        apiKey: "erp-key-1",
        ERP_API_KEY: "erp-key-2",
        headers: { "x-api-key": "erp-key-3" },
      },
      "erp key",
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(output).not.toContain("erp-key-");
    expect(output).toContain("[REDACTED]");
  });
});

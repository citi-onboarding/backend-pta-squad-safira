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

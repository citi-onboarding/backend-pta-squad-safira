import pino from "pino";
import type { DestinationStream } from "pino";

import type { Environment } from "../config/env.js";

export function createLogger(
  environment: Pick<Environment, "LOG_LEVEL">,
  destination?: DestinationStream,
) {
  return pino(
    {
      level: environment.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "password",
          "token",
          "accessToken",
          "refreshToken",
          "apiKey",
          "ERP_API_KEY",
          'headers["x-api-key"]',
          "ANTHROPIC_API_KEY",
        ],
        censor: "[REDACTED]",
      },
    },
    destination,
  );
}

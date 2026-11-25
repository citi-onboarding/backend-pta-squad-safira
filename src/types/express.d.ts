import type { Logger } from "pino";

import type { SessionUser } from "../shared/http/require-role.js";

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      user?: SessionUser;
    }
  }
}

export {};

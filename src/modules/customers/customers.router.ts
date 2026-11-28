import { Router } from "express";
import type { Request, RequestHandler, Router as ExpressRouter } from "express";

import { HttpProblem } from "../../shared/http/problem.js";
import { clientPortfolioFilter } from "../../shared/http/require-role.js";
import {
  customerIdSchema,
  customerPageSchema,
  customerProfileSchema,
  customerSearchQuerySchema,
} from "./customers.schemas.js";
import type { CustomersService, PortfolioFilter } from "./customers.service.js";
import "./customers.openapi.js";

interface CustomersRouterOptions {
  customersService: CustomersService;
  authenticate: RequestHandler;
}

// The portfolio always comes from the signed-in user (RN-08), never from the
// request. Roles without a portfolio (Administrator, salesperson without a
// code) have no access to clients.
function portfolioOf(request: Request): PortfolioFilter {
  const filter =
    request.user === undefined ? null : clientPortfolioFilter(request.user);
  if (filter === null) {
    throw new HttpProblem(
      403,
      "Forbidden",
      "Your role does not give access to clients.",
    );
  }
  return filter;
}

export function createCustomersRouter({
  customersService,
  authenticate,
}: CustomersRouterOptions): ExpressRouter {
  const router = Router();
  router.use(authenticate);

  router.get("/", async (request, response) => {
    const filter = portfolioOf(request);
    const query = customerSearchQuerySchema.parse(request.query);
    const page = await customersService.search(filter, query);
    response.json(customerPageSchema.parse(page));
  });

  router.get("/:id", async (request, response) => {
    const filter = portfolioOf(request);
    const { id } = customerIdSchema.parse(request.params);
    const profile = await customersService.getProfile(filter, id);
    if (profile === null) {
      throw new HttpProblem(404, "Not Found", "Client not found.");
    }
    response.json(customerProfileSchema.parse(profile));
  });

  return router;
}

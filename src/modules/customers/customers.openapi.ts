import { openApiRegistry } from "../../shared/http/openapi.js";
import {
  customerIdSchema,
  customerPageSchema,
  customerProfileSchema,
  customerSearchQuerySchema,
} from "./customers.schemas.js";

const portfolioAccess = {
  401: { description: "No valid session" },
  403: {
    description:
      "The role has no access to clients (Administrator, or a salesperson without a salesperson code)",
  },
};

openApiRegistry.registerPath({
  method: "get",
  path: "/clientes",
  tags: ["Customers"],
  summary: "Search clients of the signed-in user's portfolio",
  description:
    "A salesperson only finds clients of their own portfolio (RN-08); the sales manager and the finance role find every client. At most 60 clients per page, ordered by company name.",
  request: { query: customerSearchQuerySchema },
  responses: {
    200: {
      description: "One page of matching clients",
      content: { "application/json": { schema: customerPageSchema } },
    },
    400: { description: "Invalid page or search term" },
    ...portfolioAccess,
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/clientes/{id}",
  tags: ["Customers"],
  summary: "Get a client's profile and credit position",
  description:
    "A client of another portfolio answers 404, the same as a client that does not exist.",
  request: { params: customerIdSchema },
  responses: {
    200: {
      description: "Client profile",
      content: { "application/json": { schema: customerProfileSchema } },
    },
    400: { description: "Malformed client id" },
    404: { description: "Client not found in the user's portfolio" },
    ...portfolioAccess,
  },
});

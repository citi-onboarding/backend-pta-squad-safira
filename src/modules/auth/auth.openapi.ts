import { openApiRegistry } from "../../shared/http/openapi.js";
import { currentUserSchema, signInSchema } from "./auth.schemas.js";

openApiRegistry.register("CurrentUser", currentUserSchema);

openApiRegistry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Sign in with email and password",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: signInSchema } },
    },
  },
  responses: {
    200: {
      description: "Signed in. Sets the HttpOnly session cookie.",
      content: { "application/json": { schema: currentUserSchema } },
    },
    400: { description: "Invalid request" },
    401: { description: "Invalid email or password" },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Sign out and remove the session cookie",
  responses: {
    204: { description: "Signed out" },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "Get the signed-in user",
  responses: {
    200: {
      description: "Signed-in user",
      content: { "application/json": { schema: currentUserSchema } },
    },
    401: { description: "No valid session" },
  },
});

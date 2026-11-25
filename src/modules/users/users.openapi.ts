import { openApiRegistry } from "../../shared/http/openapi.js";
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdSchema,
  userListSchema,
  userSchema,
} from "./users.schemas.js";

openApiRegistry.register("User", userSchema);

const adminOnly = {
  401: { description: "No valid session" },
  403: { description: "Only the Administrator role may manage users" },
};

openApiRegistry.registerPath({
  method: "get",
  path: "/users",
  tags: ["Users"],
  summary: "List users",
  responses: {
    200: {
      description: "Users",
      content: { "application/json": { schema: userListSchema } },
    },
    ...adminOnly,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/users",
  tags: ["Users"],
  summary: "Create a user",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createUserSchema } },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: userSchema } },
    },
    400: { description: "Invalid request" },
    409: { description: "Email or salesperson code already in use" },
    ...adminOnly,
  },
});

openApiRegistry.registerPath({
  method: "patch",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Change a user's name, role, or active flag",
  request: {
    params: userIdSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateUserSchema } },
    },
  },
  responses: {
    200: {
      description: "Updated user",
      content: { "application/json": { schema: userSchema } },
    },
    400: { description: "Invalid request" },
    404: { description: "User not found" },
    ...adminOnly,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/users/{id}/redefinir-senha",
  tags: ["Users"],
  summary: "Set a new password for a user",
  request: {
    params: userIdSchema,
    body: {
      required: true,
      content: { "application/json": { schema: resetPasswordSchema } },
    },
  },
  responses: {
    204: { description: "Password changed" },
    400: { description: "Invalid request" },
    404: { description: "User not found" },
    ...adminOnly,
  },
});

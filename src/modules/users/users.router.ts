import { Router } from "express";
import type { RequestHandler, Router as ExpressRouter } from "express";

import { HttpProblem } from "../../shared/http/problem.js";
import { requireRole } from "../../shared/http/require-role.js";
import { validate } from "../../shared/http/validate.js";
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdSchema,
  userListSchema,
  userSchema,
} from "./users.schemas.js";
import { UserConflictError } from "./users.service.js";
import type { UsersService } from "./users.service.js";
import "./users.openapi.js";

interface UsersRouterOptions {
  usersService: UsersService;
  authenticate: RequestHandler;
}

function userNotFound(): HttpProblem {
  return new HttpProblem(404, "Not Found", "User not found.");
}

export function createUsersRouter({
  usersService,
  authenticate,
}: UsersRouterOptions): ExpressRouter {
  const router = Router();
  router.use(authenticate, requireRole("ADMINISTRADOR"));

  router.get("/", async (_request, response) => {
    response.json(userListSchema.parse(await usersService.list()));
  });

  router.post(
    "/",
    validate({ body: createUserSchema }),
    async (request, response) => {
      const input = createUserSchema.parse(request.body);
      try {
        const user = await usersService.create(input);
        response
          .location(`/users/${user.id}`)
          .status(201)
          .json(userSchema.parse(user));
      } catch (error) {
        if (error instanceof UserConflictError) {
          throw new HttpProblem(409, "Conflict", error.message);
        }
        throw error;
      }
    },
  );

  router.patch(
    "/:id",
    validate({ params: userIdSchema, body: updateUserSchema }),
    async (request, response) => {
      const { id } = userIdSchema.parse(request.params);
      const changes = updateUserSchema.parse(request.body);
      const user = await usersService.update(id, changes);
      if (user === null) {
        throw userNotFound();
      }
      response.json(userSchema.parse(user));
    },
  );

  router.post(
    "/:id/redefinir-senha",
    validate({ params: userIdSchema, body: resetPasswordSchema }),
    async (request, response) => {
      const { id } = userIdSchema.parse(request.params);
      const { senha } = resetPasswordSchema.parse(request.body);
      if (!(await usersService.resetPassword(id, senha))) {
        throw userNotFound();
      }
      response.status(204).send();
    },
  );

  return router;
}

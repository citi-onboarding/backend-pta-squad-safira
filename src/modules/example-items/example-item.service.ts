import { Prisma } from "../../shared/database/generated/client.js";
import { HttpProblem } from "../../shared/http/problem.js";
import type {
  CreateExampleItemInput,
  UpdateExampleItemInput,
} from "./example-item.schemas.js";
import type { ExampleItemRepository } from "./example-item.repository.js";

export class ExampleItemService {
  constructor(private readonly repository: ExampleItemRepository) {}

  create(input: CreateExampleItemInput) {
    return this.repository.create(input);
  }

  list() {
    return this.repository.findAll();
  }

  async get(id: string) {
    const item = await this.repository.findById(id);
    if (!item) throw this.notFound(id);
    return item;
  }

  async update(id: string, input: UpdateExampleItemInput) {
    try {
      return await this.repository.update(id, input);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw this.notFound(id);
      }
      throw error;
    }
  }

  async delete(id: string) {
    try {
      await this.repository.delete(id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw this.notFound(id);
      }
      throw error;
    }
  }

  private notFound(id: string) {
    return new HttpProblem(
      404,
      "Example Item Not Found",
      `Example item ${id} does not exist.`,
    );
  }
}

import type { Database } from "../../shared/database/create-database.js";
import type {
  CreateExampleItemInput,
  UpdateExampleItemInput,
} from "./example-item.schemas.js";

export class ExampleItemRepository {
  constructor(private readonly database: Database) {}

  create(input: CreateExampleItemInput) {
    return this.database.exampleItem.create({
      data: {
        name: input.name,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
    });
  }

  findAll() {
    return this.database.exampleItem.findMany({
      orderBy: { createdAt: "asc" },
    });
  }

  findById(id: string) {
    return this.database.exampleItem.findUnique({ where: { id } });
  }

  update(id: string, input: UpdateExampleItemInput) {
    return this.database.exampleItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
    });
  }

  delete(id: string) {
    return this.database.exampleItem.delete({ where: { id } });
  }
}

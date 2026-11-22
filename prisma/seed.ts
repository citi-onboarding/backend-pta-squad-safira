import { createDatabase } from "../src/shared/database/create-database.js";

const database = createDatabase();

try {
  // Add idempotent project seeds in this block.
  // <example-item-seed>
  await database.exampleItem.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Example item",
      description: "Safe to remove with pnpm remove:example",
    },
  });
  // </example-item-seed>
} finally {
  await database.$disconnect();
}

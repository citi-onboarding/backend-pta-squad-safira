import { createDatabase } from "../src/shared/database/create-database.js";

const database = createDatabase();

try {
  // Add idempotent project seeds in this block.
} finally {
  await database.$disconnect();
}

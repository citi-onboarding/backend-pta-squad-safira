import { access, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleDirectory = path.join(root, "src/modules/example-items");
const migrationDirectory = path.join(
  root,
  "prisma/migrations/20260813000000_initial",
);
const integrationTest = path.join(
  root,
  "src/modules/example-items/example-items.integration.test.ts",
);
const replacements = [
  ["src/app/create-app.ts", "example-item-imports"],
  ["src/app/create-app.ts", "example-item-routes"],
  ["prisma/schema.prisma", "example-item-model"],
  ["prisma/seed.ts", "example-item-seed"],
  ["scripts/generate-openapi.ts", "example-item-openapi"],
  ["scripts/check-openapi.ts", "example-item-openapi"],
];

export function removeMarkedBlock(content, marker) {
  const pattern = new RegExp(
    `\\n?\\s*// <${marker}>[\\s\\S]*?// </${marker}>\\n?`,
    "g",
  );
  const matches = content.match(pattern);
  if (matches?.length !== 1)
    throw new Error(`Expected exactly one ${marker} block.`);
  return content.replace(pattern, "\n");
}

export async function removeExample() {
  await Promise.all([
    access(moduleDirectory),
    access(migrationDirectory),
    access(integrationTest),
  ]);
  const files = new Map();
  for (const [relativePath, marker] of replacements) {
    const absolutePath = path.join(root, relativePath);
    const current =
      files.get(absolutePath) ?? (await readFile(absolutePath, "utf8"));
    files.set(absolutePath, removeMarkedBlock(current, marker));
  }

  for (const [absolutePath, content] of files)
    await writeFile(absolutePath, content, "utf8");
  await rm(moduleDirectory, { recursive: true });
  await rm(migrationDirectory, { recursive: true });
  console.log("Example module and its initial migration were removed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await removeExample();
}

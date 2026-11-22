import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function assertModuleName(name) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    throw new Error("Module name must use kebab-case.");
  return name;
}

export async function generateModule(name) {
  const safeName = assertModuleName(name);
  const target = path.join(root, "src/modules", safeName);
  await mkdir(target, { recursive: false });
  await Promise.all([
    writeFile(
      path.join(target, `${safeName}.schemas.ts`),
      'import { z } from "zod";\n\nexport const inputSchema = z.strictObject({});\n',
    ),
    writeFile(
      path.join(target, `${safeName}.service.ts`),
      `export class ${safeName
        .split("-")
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join("")}Service {}\n`,
    ),
    writeFile(
      path.join(target, `${safeName}.test.ts`),
      'import { describe, it } from "vitest";\n\ndescribe("module", () => {\n  it.todo("implements its first specification scenario");\n});\n',
    ),
  ]);
  console.log(`Generated src/modules/${safeName}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  if (!name) throw new Error("Usage: pnpm gen:module module-name");
  await generateModule(name);
}

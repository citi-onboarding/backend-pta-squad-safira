import { execFileSync } from "node:child_process";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { removeExample } from "./remove-example.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function toPackageName(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function initializeProject({
  name,
  packageName = toPackageName(name),
}) {
  if (!name.trim()) throw new Error("Project name is required.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageName))
    throw new Error("Package name must use npm kebab-case.");
  try {
    await access(path.join(root, ".initialized"));
    throw new Error("This project has already been initialized.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("already"))
      throw error;
  }

  const packagePath = path.join(root, "package.json");
  const projectPath = path.join(root, "src/shared/project.ts");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  packageJson.name = packageName;
  const projectSource = await readFile(projectPath, "utf8");
  if (!projectSource.includes('PROJECT_DISPLAY_NAME = "Node Boilerplate"')) {
    throw new Error(
      "Project name marker changed; initialization stopped safely.",
    );
  }

  await writeFile(
    packagePath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    projectPath,
    projectSource.replace("Node Boilerplate", name.trim()),
    "utf8",
  );
  await copyFile(path.join(root, ".env.example"), path.join(root, ".env"));
  await removeExample();
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/generate-openapi.ts"],
    { cwd: root, stdio: "inherit" },
  );
  await writeFile(
    path.join(root, ".initialized"),
    `${new Date().toISOString()}\n`,
    "utf8",
  );
  console.log(
    `Initialized ${name.trim()} (${packageName}). Define the first model, create a migration, and run pnpm db:generate.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = argument("--name");
  if (!name)
    throw new Error(
      'Usage: pnpm init:project --name "Project Name" [--package-name project-name]',
    );
  await initializeProject({
    name,
    packageName: argument("--package-name") ?? toPackageName(name),
  });
}

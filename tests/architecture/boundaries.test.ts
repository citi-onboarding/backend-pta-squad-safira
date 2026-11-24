import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// @ts-expect-error The executable ESLint config intentionally remains JavaScript.
import { createArchitectureConfig } from "../../architecture.config.mjs";

// fileURLToPath decodes %20 and Windows drive letters; URL.pathname does not.
const fixturesRoot = fileURLToPath(new URL("./fixtures", import.meta.url));

async function messages(file: string) {
  const eslint = new ESLint({
    cwd: fixturesRoot,
    overrideConfigFile: true,
    overrideConfig: [createArchitectureConfig({ rootPath: fixturesRoot })],
  });
  return (
    (await eslint.lintFiles(file))[0]?.messages.map(
      (message) => message.message,
    ) ?? []
  );
}

describe("architecture boundaries", () => {
  it("allows modules to import shared code", async () => {
    expect(await messages("src/modules/auth/valid.ts")).toEqual([]);
  });

  it("blocks cross-module imports", async () => {
    expect(await messages("src/modules/auth/cross-module.ts")).toContain(
      "A module must not import another module. Promote shared code to src/shared.",
    );
  });

  it("blocks shared imports from upper layers", async () => {
    expect(await messages("src/shared/upper-import.ts")).toContain(
      "Shared code must not depend on modules or application composition.",
    );
  });
});

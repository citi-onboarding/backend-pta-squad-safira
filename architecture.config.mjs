import boundaries from "eslint-plugin-boundaries";

export function createArchitectureConfig({
  rootPath = process.cwd(),
  sourceRoot = "src",
} = {}) {
  return {
    files: [`${sourceRoot}/**/*.ts`],
    ignores: [`${sourceRoot}/**/*.test.ts`],
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": rootPath,
      "boundaries/legacy-templates": false,
      "import/resolver": {
        typescript: {
          project: `${rootPath}/tsconfig.json`,
          alwaysTryTypes: true,
        },
      },
      "boundaries/elements": [
        { type: "app", pattern: `${sourceRoot}/app` },
        {
          type: "module",
          pattern: `${sourceRoot}/modules/*`,
          capture: ["module"],
        },
        { type: "shared", pattern: `${sourceRoot}/shared` },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "module" } },
              disallow: { to: { element: { type: "app" } } },
              message:
                "Modules must not import the application composition layer.",
            },
            {
              from: { element: { type: "module" } },
              disallow: {
                to: {
                  element: {
                    type: "module",
                    captured: { module: "!{{from.element.captured.module}}" },
                  },
                },
              },
              message:
                "A module must not import another module. Promote shared code to src/shared.",
            },
            {
              from: { element: { type: "shared" } },
              disallow: {
                to: { element: { types: { anyOf: ["module", "app"] } } },
              },
              message:
                "Shared code must not depend on modules or application composition.",
            },
          ],
        },
      ],
    },
  };
}

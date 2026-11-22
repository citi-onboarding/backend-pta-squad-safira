import js from "@eslint/js";
import checkFile from "eslint-plugin-check-file";
import globals from "globals";
import tseslint from "typescript-eslint";

import { createArchitectureConfig } from "./architecture.config.mjs";

const typedConfigs = [
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
].map((config) => ({ ...config, files: ["**/*.ts"] }));

const namingRules = {
  "check-file/no-index": "error",
  "check-file/filename-naming-convention": [
    "error",
    { "**/*.{js,mjs,ts}": "KEBAB_CASE" },
    { ignoreMiddleExtensions: true },
  ],
  "check-file/folder-naming-convention": [
    "error",
    {
      "src/**/": "KEBAB_CASE",
      "scripts/**/": "KEBAB_CASE",
      "tests/**/": "KEBAB_CASE",
    },
  ],
};

export default tseslint.config(
  js.configs.recommended,
  ...typedConfigs,
  createArchitectureConfig(),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    plugins: { "check-file": checkFile },
    rules: {
      ...namingRules,
      "@typescript-eslint/consistent-type-imports": "error",
      // Express error handlers need four arguments; `_next` is unused on purpose.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
    plugins: { "check-file": checkFile },
    rules: namingRules,
  },
  {
    files: ["tests/**/*.ts", "src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "src/shared/database/generated/**",
      "tests/architecture/fixtures/**",
      "openapi.json",
    ],
  },
);

import { describe, expect, it } from "vitest";

// @ts-expect-error The executable generator intentionally remains JavaScript.
import { assertModuleName } from "../../scripts/generate-module.mjs";
// @ts-expect-error The executable initializer intentionally remains JavaScript.
import { toPackageName } from "../../scripts/initialize-project.mjs";
// @ts-expect-error The executable removal script intentionally remains JavaScript.
import { removeMarkedBlock } from "../../scripts/remove-example.mjs";

describe("project generators", () => {
  it("normalizes display names into npm package names", () => {
    expect(toPackageName("Operação Ágil API")).toBe("operacao-agil-api");
  });

  it("accepts only kebab-case module names", () => {
    expect(assertModuleName("team-members")).toBe("team-members");
    expect(() => assertModuleName("TeamMembers")).toThrow("kebab-case");
  });

  it("removes exactly one guarded block", () => {
    expect(
      removeMarkedBlock(
        "before\n// <example>\ninside\n// </example>\nafter",
        "example",
      ),
    ).toBe("before\nafter");
    expect(() => removeMarkedBlock("unchanged", "example")).toThrow(
      "exactly one",
    );
  });
});

import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("never stores the password itself and uses argon2id", async () => {
    const hash = await hashPassword("correct-password");

    expect(hash).not.toBe("correct-password");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("creates a different hash for the same password each time", async () => {
    const first = await hashPassword("correct-password");
    const second = await hashPassword("correct-password");

    expect(first).not.toBe(second);
  });

  it("accepts the right password", async () => {
    const hash = await hashPassword("correct-password");

    await expect(verifyPassword(hash, "correct-password")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-password");

    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });

  it("rejects a hash that is not argon2 instead of crashing", async () => {
    await expect(
      verifyPassword("scrypt$salt$hash", "correct-password"),
    ).resolves.toBe(false);
  });
});

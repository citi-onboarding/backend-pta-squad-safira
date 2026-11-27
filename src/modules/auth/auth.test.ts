import { describe, expect, it, vi } from "vitest";

import type { AuthRepository, AuthUserRecord } from "./auth.service.js";
import { AuthService } from "./auth.service.js";

const patricia: AuthUserRecord = {
  id: "user-1",
  nome: "Patrícia",
  papel: "VENDEDOR",
  ativo: true,
  senhaHash: "stored-hash",
};

function createService(storedUser: AuthUserRecord | null) {
  const repository: AuthRepository = {
    findByEmail: vi.fn().mockResolvedValue(storedUser),
  };
  const verifyPassword = vi.fn((hash: string, password: string) =>
    Promise.resolve(hash === "stored-hash" && password === "right-password"),
  );

  return {
    service: new AuthService(repository, verifyPassword),
    repository,
    verifyPassword,
  };
}

describe("sign-in", () => {
  it("returns id, nome, and papel for an active user with the right password", async () => {
    const { service } = createService(patricia);

    await expect(
      service.signIn("patricia@distrilux.com.br", "right-password"),
    ).resolves.toEqual({ id: "user-1", nome: "Patrícia", papel: "VENDEDOR" });
  });

  it("never returns the password hash", async () => {
    const { service } = createService(patricia);

    const user = await service.signIn(
      "patricia@distrilux.com.br",
      "right-password",
    );

    expect(user).not.toHaveProperty("senhaHash");
  });

  it("returns null for a wrong password", async () => {
    const { service } = createService(patricia);

    await expect(
      service.signIn("patricia@distrilux.com.br", "wrong-password"),
    ).resolves.toBeNull();
  });

  it("returns null for an unknown email", async () => {
    const { service } = createService(null);

    await expect(
      service.signIn("nobody@distrilux.com.br", "right-password"),
    ).resolves.toBeNull();
  });

  it("still checks a password for an unknown email, so the response time does not reveal it", async () => {
    const { service, verifyPassword } = createService(null);

    await service.signIn("nobody@distrilux.com.br", "right-password");

    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("returns null for an inactive user even with the right password", async () => {
    const { service } = createService({ ...patricia, ativo: false });

    await expect(
      service.signIn("patricia@distrilux.com.br", "right-password"),
    ).resolves.toBeNull();
  });
});

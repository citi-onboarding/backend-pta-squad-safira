import { describe, expect, it, vi } from "vitest";

import type { NewUserData, UserRecord } from "./users.service.js";
import { UserConflictError, UsersService } from "./users.service.js";

const patricia: UserRecord = {
  id: "user-1",
  nome: "Patrícia",
  email: "patricia@distrilux.com.br",
  papel: "VENDEDOR",
  ativo: true,
  codigoVendedor: "V01",
};

function createService(existingUsers: UserRecord[] = [patricia]) {
  const repository = {
    list: vi.fn().mockResolvedValue(existingUsers),
    findByEmail: vi.fn((email: string) =>
      Promise.resolve(
        existingUsers.find((user) => user.email === email) ?? null,
      ),
    ),
    findBySalespersonCode: vi.fn((code: string) =>
      Promise.resolve(
        existingUsers.find((user) => user.codigoVendedor === code) ?? null,
      ),
    ),
    create: vi.fn(({ senhaHash: _senhaHash, ...data }: NewUserData) =>
      Promise.resolve({ ...data, id: "new-user", ativo: true }),
    ),
    update: vi.fn((id: string, changes: Partial<UserRecord>) =>
      Promise.resolve(id === patricia.id ? { ...patricia, ...changes } : null),
    ),
    updatePasswordHash: vi.fn((id: string) =>
      Promise.resolve(id === patricia.id),
    ),
  };
  const hashPassword = vi.fn((password: string) =>
    Promise.resolve(`hashed:${password}`),
  );

  return {
    service: new UsersService(repository, hashPassword),
    repository,
  };
}

const newSeller = {
  nome: "Juliana",
  email: "juliana@distrilux.com.br",
  senha: "initial-password",
  papel: "VENDEDOR" as const,
  codigoVendedor: "V02",
};

describe("list users", () => {
  it("returns every user from the repository", async () => {
    const { service } = createService();

    await expect(service.list()).resolves.toEqual([patricia]);
  });
});

describe("create a user", () => {
  it("stores only the hash of the initial password", async () => {
    const { service, repository } = createService();

    await service.create(newSeller);

    const stored = repository.create.mock.calls[0]?.[0];
    expect(stored).toMatchObject({ senhaHash: "hashed:initial-password" });
    expect(JSON.stringify(stored)).not.toContain('"initial-password"');
  });

  it("returns the new user", async () => {
    const { service } = createService();

    const user = await service.create(newSeller);

    expect(user).toEqual({
      id: "new-user",
      nome: "Juliana",
      email: "juliana@distrilux.com.br",
      papel: "VENDEDOR",
      ativo: true,
      codigoVendedor: "V02",
    });
  });

  it("rejects an email that is already registered and creates nothing", async () => {
    const { service, repository } = createService();

    await expect(
      service.create({ ...newSeller, email: patricia.email }),
    ).rejects.toEqual(new UserConflictError("email"));
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects a salesperson code already linked to another user", async () => {
    const { service, repository } = createService();

    await expect(
      service.create({ ...newSeller, codigoVendedor: "V01" }),
    ).rejects.toEqual(new UserConflictError("codigoVendedor"));
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates a user who is not a salesperson without a salesperson code", async () => {
    const { service } = createService();

    const user = await service.create({
      ...newSeller,
      papel: "GERENTE",
      codigoVendedor: null,
    });

    expect(user.codigoVendedor).toBeNull();
  });
});

describe("update a user", () => {
  it("changes the name, role, and active flag", async () => {
    const { service } = createService();

    await expect(
      service.update("user-1", { papel: "GERENTE", ativo: false }),
    ).resolves.toMatchObject({ papel: "GERENTE", ativo: false });
  });

  it("returns null for an unknown user", async () => {
    const { service } = createService();

    await expect(
      service.update("missing", { ativo: false }),
    ).resolves.toBeNull();
  });
});

describe("reset a password", () => {
  it("stores the hash of the new password", async () => {
    const { service, repository } = createService();

    await expect(service.resetPassword("user-1", "new-password")).resolves.toBe(
      true,
    );
    expect(repository.updatePasswordHash).toHaveBeenCalledWith(
      "user-1",
      "hashed:new-password",
    );
  });

  it("returns false for an unknown user", async () => {
    const { service } = createService();

    await expect(
      service.resetPassword("missing", "new-password"),
    ).resolves.toBe(false);
  });
});

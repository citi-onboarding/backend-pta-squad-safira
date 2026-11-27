import { describe, expect, it, vi } from "vitest";

import type { NewUserData, UserRecord } from "./users.service.js";
import {
  LastAdministratorError,
  SalespersonCodeRequiredError,
  UserConflictError,
  UsersService,
} from "./users.service.js";

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
    findById: vi.fn((id: string) =>
      Promise.resolve(existingUsers.find((user) => user.id === id) ?? null),
    ),
    countActiveAdministrators: vi.fn(() =>
      Promise.resolve(
        existingUsers.filter(
          (user) => user.papel === "ADMINISTRADOR" && user.ativo,
        ).length,
      ),
    ),
    update: vi.fn((id: string, changes: Partial<UserRecord>) => {
      const user = existingUsers.find((candidate) => candidate.id === id);
      return Promise.resolve(user ? { ...user, ...changes } : null);
    }),
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

const fernanda: UserRecord = {
  id: "user-2",
  nome: "Fernanda",
  email: "fernanda@distrilux.com.br",
  papel: "GERENTE",
  ativo: true,
  codigoVendedor: null,
};

const lucas: UserRecord = {
  id: "user-3",
  nome: "Lucas",
  email: "lucas@distrilux.com.br",
  papel: "ADMINISTRADOR",
  ativo: true,
  codigoVendedor: null,
};

describe("update the salesperson code", () => {
  it("rejects turning a user without a code into a salesperson and changes nothing", async () => {
    const { service, repository } = createService([patricia, fernanda]);

    await expect(
      service.update(fernanda.id, { papel: "VENDEDOR" }),
    ).rejects.toBeInstanceOf(SalespersonCodeRequiredError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("turns a user into a salesperson when a free code is sent", async () => {
    const { service, repository } = createService([patricia, fernanda]);

    await expect(
      service.update(fernanda.id, { papel: "VENDEDOR", codigoVendedor: "V09" }),
    ).resolves.toMatchObject({ papel: "VENDEDOR", codigoVendedor: "V09" });
    expect(repository.update).toHaveBeenCalledWith(fernanda.id, {
      papel: "VENDEDOR",
      codigoVendedor: "V09",
    });
  });

  it("rejects a code linked to another user and changes nothing", async () => {
    const { service, repository } = createService([patricia, fernanda]);

    await expect(
      service.update(fernanda.id, { papel: "VENDEDOR", codigoVendedor: "V01" }),
    ).rejects.toEqual(new UserConflictError("codigoVendedor"));
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("accepts the salesperson's own current code", async () => {
    const { service } = createService([patricia, fernanda]);

    await expect(
      service.update(patricia.id, { codigoVendedor: "V01" }),
    ).resolves.toMatchObject({ codigoVendedor: "V01" });
  });

  it("changes the code of a salesperson", async () => {
    const { service } = createService([patricia, fernanda]);

    await expect(
      service.update(patricia.id, { codigoVendedor: "V10" }),
    ).resolves.toMatchObject({ papel: "VENDEDOR", codigoVendedor: "V10" });
  });

  it("rejects removing the code of a user who stays a salesperson", async () => {
    const { service, repository } = createService([patricia, fernanda]);

    await expect(
      service.update(patricia.id, { codigoVendedor: null }),
    ).rejects.toBeInstanceOf(SalespersonCodeRequiredError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("keeps the code when a salesperson leaves the role", async () => {
    const { service, repository } = createService([patricia, fernanda]);

    await expect(
      service.update(patricia.id, { papel: "GERENTE" }),
    ).resolves.toMatchObject({ papel: "GERENTE", codigoVendedor: "V01" });
    expect(repository.update).toHaveBeenCalledWith(patricia.id, {
      papel: "GERENTE",
    });
  });
});

describe("keep an active administrator", () => {
  it.each([
    ["deactivating", { ativo: false }],
    ["demoting", { papel: "GERENTE" as const }],
  ])(
    "rejects %s the only active administrator and changes nothing",
    async (_action, changes) => {
      const { service, repository } = createService([patricia, lucas]);

      await expect(service.update(lucas.id, changes)).rejects.toBeInstanceOf(
        LastAdministratorError,
      );
      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it("deactivates an administrator when another one stays active", async () => {
    const ana: UserRecord = { ...lucas, id: "user-4", nome: "Ana" };
    const { service } = createService([lucas, ana]);

    await expect(
      service.update(lucas.id, { ativo: false }),
    ).resolves.toMatchObject({ ativo: false });
  });

  it("changes the name of the only active administrator", async () => {
    const { service } = createService([lucas]);

    await expect(
      service.update(lucas.id, { nome: "Lucas Moura" }),
    ).resolves.toMatchObject({ nome: "Lucas Moura" });
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

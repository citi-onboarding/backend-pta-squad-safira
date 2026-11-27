import type { Papel } from "../../shared/database/generated/enums.js";

export interface UserRecord {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  codigoVendedor: string | null;
}

export interface NewUserData {
  nome: string;
  email: string;
  senhaHash: string;
  papel: Papel;
  codigoVendedor: string | null;
}

export interface UserChanges {
  nome?: string | undefined;
  papel?: Papel | undefined;
  ativo?: boolean | undefined;
  codigoVendedor?: string | null | undefined;
}

export interface CreateUserInput {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
  codigoVendedor?: string | null | undefined;
}

export interface UsersRepository {
  list(): Promise<UserRecord[]>;
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  countActiveAdministrators(): Promise<number>;
  findBySalespersonCode(code: string): Promise<UserRecord | null>;
  create(data: NewUserData): Promise<UserRecord>;
  update(id: string, changes: UserChanges): Promise<UserRecord | null>;
  updatePasswordHash(id: string, senhaHash: string): Promise<boolean>;
}

export type HashPassword = (password: string) => Promise<string>;

export class UserConflictError extends Error {
  constructor(readonly field: "email" | "codigoVendedor") {
    super(`A user with this ${field} already exists.`);
    this.name = "UserConflictError";
  }
}

export class SalespersonCodeRequiredError extends Error {
  constructor() {
    super("A salesperson needs a salesperson code.");
    this.name = "SalespersonCodeRequiredError";
  }
}

export class LastAdministratorError extends Error {
  constructor() {
    super("At least one active administrator is required.");
    this.name = "LastAdministratorError";
  }
}

export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly hashPassword: HashPassword,
  ) {}

  list(): Promise<UserRecord[]> {
    return this.repository.list();
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const codigoVendedor = input.codigoVendedor ?? null;

    if (await this.repository.findByEmail(input.email)) {
      throw new UserConflictError("email");
    }
    if (
      codigoVendedor !== null &&
      (await this.repository.findBySalespersonCode(codigoVendedor))
    ) {
      throw new UserConflictError("codigoVendedor");
    }

    return this.repository.create({
      nome: input.nome,
      email: input.email,
      senhaHash: await this.hashPassword(input.senha),
      papel: input.papel,
      codigoVendedor,
    });
  }

  async update(id: string, changes: UserChanges): Promise<UserRecord | null> {
    const current = await this.repository.findById(id);
    if (current === null) {
      return null;
    }

    const papel = changes.papel ?? current.papel;
    const ativo = changes.ativo ?? current.ativo;
    const codigoVendedor =
      changes.codigoVendedor === undefined
        ? current.codigoVendedor
        : changes.codigoVendedor;

    if (papel === "VENDEDOR" && !codigoVendedor) {
      throw new SalespersonCodeRequiredError();
    }
    if (codigoVendedor !== null && codigoVendedor !== current.codigoVendedor) {
      const owner = await this.repository.findBySalespersonCode(codigoVendedor);
      if (owner !== null && owner.id !== id) {
        throw new UserConflictError("codigoVendedor");
      }
    }

    const losesAnAdministrator =
      current.papel === "ADMINISTRADOR" &&
      current.ativo &&
      (papel !== "ADMINISTRADOR" || !ativo);
    if (
      losesAnAdministrator &&
      (await this.repository.countActiveAdministrators()) <= 1
    ) {
      throw new LastAdministratorError();
    }

    return this.repository.update(id, changes);
  }

  async resetPassword(id: string, senha: string): Promise<boolean> {
    return this.repository.updatePasswordHash(
      id,
      await this.hashPassword(senha),
    );
  }
}

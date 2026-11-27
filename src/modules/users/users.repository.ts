import type { Database } from "../../shared/database/create-database.js";
import type { Papel } from "../../shared/database/generated/enums.js";
import { UserConflictError } from "./users.service.js";
import type {
  NewUserData,
  UserChanges,
  UserRecord,
  UsersRepository,
} from "./users.service.js";

const userFields = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  ativo: true,
  codigoVendedor: true,
} as const;

interface UpdateData {
  nome?: string;
  papel?: Papel;
  ativo?: boolean;
  codigoVendedor?: string | null;
}

// Prisma rejects properties set to undefined, so only the changes that were
// actually sent are passed on.
function toUpdateData(changes: UserChanges): UpdateData {
  const data: UpdateData = {};
  if (changes.nome !== undefined) {
    data.nome = changes.nome;
  }
  if (changes.papel !== undefined) {
    data.papel = changes.papel;
  }
  if (changes.ativo !== undefined) {
    data.ativo = changes.ativo;
  }
  if (changes.codigoVendedor !== undefined) {
    data.codigoVendedor = changes.codigoVendedor;
  }
  return data;
}

// A unique-constraint violation (Prisma code P2002) means another request
// stored the same email or salesperson code first; it becomes the same
// conflict the service raises after its own checks.
function toConflict(error: unknown): unknown {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return new UserConflictError(
      JSON.stringify(error).includes("codigoVendedor")
        ? "codigoVendedor"
        : "email",
    );
  }
  return error;
}

export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly database: Database) {}

  list(): Promise<UserRecord[]> {
    return this.database.usuario.findMany({
      select: userFields,
      orderBy: { nome: "asc" },
    });
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.database.usuario.findUnique({
      where: { id },
      select: userFields,
    });
  }

  countActiveAdministrators(): Promise<number> {
    return this.database.usuario.count({
      where: { papel: "ADMINISTRADOR", ativo: true },
    });
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.database.usuario.findUnique({
      where: { email },
      select: userFields,
    });
  }

  findBySalespersonCode(code: string): Promise<UserRecord | null> {
    return this.database.usuario.findUnique({
      where: { codigoVendedor: code },
      select: userFields,
    });
  }

  async create(data: NewUserData): Promise<UserRecord> {
    try {
      return await this.database.usuario.create({ data, select: userFields });
    } catch (error) {
      throw toConflict(error);
    }
  }

  async update(id: string, changes: UserChanges): Promise<UserRecord | null> {
    let count: number;
    try {
      ({ count } = await this.database.usuario.updateMany({
        where: { id },
        data: toUpdateData(changes),
      }));
    } catch (error) {
      throw toConflict(error);
    }
    if (count === 0) {
      return null;
    }
    return this.database.usuario.findUnique({
      where: { id },
      select: userFields,
    });
  }

  async updatePasswordHash(id: string, senhaHash: string): Promise<boolean> {
    const { count } = await this.database.usuario.updateMany({
      where: { id },
      data: { senhaHash },
    });
    return count > 0;
  }
}

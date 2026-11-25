import type { Database } from "../../shared/database/create-database.js";
import type { Papel } from "../../shared/database/generated/enums.js";
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

// Prisma rejects properties set to undefined, so only the changes that were
// actually sent are passed on.
function toUpdateData(changes: UserChanges): {
  nome?: string;
  papel?: Papel;
  ativo?: boolean;
} {
  const data: { nome?: string; papel?: Papel; ativo?: boolean } = {};
  if (changes.nome !== undefined) {
    data.nome = changes.nome;
  }
  if (changes.papel !== undefined) {
    data.papel = changes.papel;
  }
  if (changes.ativo !== undefined) {
    data.ativo = changes.ativo;
  }
  return data;
}

export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly database: Database) {}

  list(): Promise<UserRecord[]> {
    return this.database.usuario.findMany({
      select: userFields,
      orderBy: { nome: "asc" },
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

  create(data: NewUserData): Promise<UserRecord> {
    return this.database.usuario.create({ data, select: userFields });
  }

  async update(id: string, changes: UserChanges): Promise<UserRecord | null> {
    const { count } = await this.database.usuario.updateMany({
      where: { id },
      data: toUpdateData(changes),
    });
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

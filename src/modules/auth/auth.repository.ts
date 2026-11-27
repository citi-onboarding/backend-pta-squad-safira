import type { Database } from "../../shared/database/create-database.js";
import type { SessionUser } from "../../shared/http/require-role.js";
import type { AuthRepository, AuthUserRecord } from "./auth.service.js";

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly database: Database) {}

  findByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.database.usuario.findUnique({
      where: { email },
      select: {
        id: true,
        nome: true,
        papel: true,
        ativo: true,
        senhaHash: true,
      },
    });
  }

  findSessionUser(id: string): Promise<SessionUser | null> {
    return this.database.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        papel: true,
        ativo: true,
        codigoVendedor: true,
      },
    });
  }
}

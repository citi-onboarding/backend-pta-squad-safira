import type { Papel } from "../../shared/database/generated/enums.js";

export interface AuthUserRecord {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  senhaHash: string;
}

export interface AuthRepository {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
}

export interface SignedInUser {
  id: string;
  nome: string;
  papel: Papel;
}

export type VerifyPassword = (
  passwordHash: string,
  password: string,
) => Promise<boolean>;

// Hash of a random value nobody knows. Checking an unknown email against it
// makes that answer take as long as a wrong password.
const UNKNOWN_USER_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$kBmlTcQ+F/acbR4nXCWibQ$0QZu4hiwqnccKoMupcZM/sV/LtwII+ay6REAcbbx3ZU";

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly verifyPassword: VerifyPassword,
  ) {}

  async signIn(email: string, password: string): Promise<SignedInUser | null> {
    const user = await this.repository.findByEmail(email);
    const passwordMatches = await this.verifyPassword(
      user?.senhaHash ?? UNKNOWN_USER_HASH,
      password,
    );

    if (!user?.ativo || !passwordMatches) {
      return null;
    }

    return { id: user.id, nome: user.nome, papel: user.papel };
  }
}

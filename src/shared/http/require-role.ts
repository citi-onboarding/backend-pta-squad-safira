import type { Papel } from "../database/generated/enums.js";

export interface PortfolioUser {
  papel: Papel;
  codigoVendedor: string | null;
}

const rolesWithEveryPortfolio: readonly Papel[] = ["GERENTE", "FINANCEIRO"];

export function canAccessClient(
  user: PortfolioUser,
  clientSalespersonCode: string | null,
): boolean {
  if (rolesWithEveryPortfolio.includes(user.papel)) {
    return true;
  }

  if (user.papel !== "VENDEDOR" || user.codigoVendedor === null) {
    return false;
  }

  return user.codigoVendedor === clientSalespersonCode;
}

import type {
  OrigemTitulo,
  StatusTitulo,
} from "../database/generated/enums.js";
import { daysBetween } from "./business-date.js";

export interface CreditReceivable {
  numero: string;
  parcela: number;
  valorCentavos: number;
  /** Due date, YYYY-MM-DD. */
  vencimento: string;
  status: StatusTitulo;
  origem: OrigemTitulo;
}

export interface CreditPosition {
  limiteCreditoCentavos: number;
  emAbertoCentavos: number;
  vencidoCentavos: number;
  limiteDisponivelCentavos: number;
}

export interface OverdueReceivable {
  numero: string;
  parcela: number;
  valorCentavos: number;
  vencimento: string;
  diasEmAtraso: number;
}

interface AvailableCreditInput {
  limiteCreditoCentavos: number;
  titulos: CreditReceivable[];
  /** Today, YYYY-MM-DD, in America/Recife. */
  hoje: string;
}

// Only unpaid ERP receivables use credit (RN-01: "conforme o ERP").
// Receivables loaded from the old spreadsheet never count.
function usesCredit(titulo: CreditReceivable): boolean {
  return titulo.origem === "ERP" && titulo.status !== "PAGO";
}

// The due date, not the ERP status, decides whether a receivable is overdue:
// between two syncs, one that fell due yesterday may still say EM_ABERTO.
function isOverdue(titulo: CreditReceivable, hoje: string): boolean {
  return titulo.vencimento < hoje;
}

/**
 * Available credit (RN-01) = credit limit − open − overdue, in cents (RN-13).
 * The result may be negative.
 */
export function calcularLimiteDisponivel({
  limiteCreditoCentavos,
  titulos,
  hoje,
}: AvailableCreditInput): CreditPosition {
  let emAbertoCentavos = 0;
  let vencidoCentavos = 0;

  for (const titulo of titulos.filter(usesCredit)) {
    if (isOverdue(titulo, hoje)) {
      vencidoCentavos += titulo.valorCentavos;
    } else {
      emAbertoCentavos += titulo.valorCentavos;
    }
  }

  return {
    limiteCreditoCentavos,
    emAbertoCentavos,
    vencidoCentavos,
    limiteDisponivelCentavos:
      limiteCreditoCentavos - emAbertoCentavos - vencidoCentavos,
  };
}

/** Unpaid ERP receivables due before today, oldest first. */
export function listOverdueReceivables(
  titulos: CreditReceivable[],
  hoje: string,
): OverdueReceivable[] {
  return titulos
    .filter((titulo) => usesCredit(titulo) && isOverdue(titulo, hoje))
    .sort((first, second) => first.vencimento.localeCompare(second.vencimento))
    .map(({ numero, parcela, valorCentavos, vencimento }) => ({
      numero,
      parcela,
      valorCentavos,
      vencimento,
      diasEmAtraso: daysBetween(vencimento, hoje),
    }));
}

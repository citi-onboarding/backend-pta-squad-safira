import { z } from "zod";

const isoDate = z.iso.date();
const DAY_MS = 86_400_000;

/**
 * RN-11: the last day to give notice is the end of the term minus the notice
 * period, in calendar days. Computed in code, never by the model (RN-19).
 * Independent of triage, so the contract-deadlines task can reuse it.
 */
export function calcularDataLimiteAviso(
  fim: string,
  avisoPrevioDias: number,
): string {
  if (!isoDate.safeParse(fim).success) {
    throw new RangeError("End of term must be a real YYYY-MM-DD date.");
  }
  if (!Number.isSafeInteger(avisoPrevioDias) || avisoPrevioDias < 0) {
    throw new RangeError(
      "Notice period must be a non-negative whole number of days.",
    );
  }
  const end = Date.parse(`${fim}T00:00:00Z`);
  return new Date(end - avisoPrevioDias * DAY_MS).toISOString().slice(0, 10);
}

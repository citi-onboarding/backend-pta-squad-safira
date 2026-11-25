import { z } from "zod";

const isoDate = z.iso.date();

/**
 * End of a term stated as N months from a base date: base + N calendar months
 * − 1 day, using the last day of the month when the day does not exist.
 * Computed in code, never by the model (RN-19).
 *
 * Assumption to confirm with the client: "12 months from the signature" could
 * also be read as ending on the same day of the month (see design.md).
 */
export function calcularFimDaVigencia(base: string, meses: number): string {
  if (!isoDate.safeParse(base).success) {
    throw new RangeError("Base date must be a real YYYY-MM-DD date.");
  }
  if (!Number.isSafeInteger(meses) || meses <= 0) {
    throw new RangeError("Duration must be a positive whole number of months.");
  }
  const [year, month, day] = base.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const targetMonth = month - 1 + meses;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

// DistriLux works on Recife time: "today" for due dates is the calendar date
// there, whatever the server's time zone.
const BUSINESS_TIME_ZONE = "America/Recife";
const MILLISECONDS_PER_DAY = 86_400_000;

// The en-CA locale formats dates as YYYY-MM-DD.
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (YYYY-MM-DD) of `now` in America/Recife. */
export function businessDate(now: Date): string {
  return dateFormatter.format(now);
}

/** Whole days from one calendar date (YYYY-MM-DD) to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      MILLISECONDS_PER_DAY,
  );
}

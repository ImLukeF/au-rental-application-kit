import type { ISODate } from "./types";
export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid calendar date");
  const d = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw new Error("Invalid calendar date");
  return d;
}
export function isoDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10) as ISODate;
}
export function addDays(date: ISODate, days: number): ISODate {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}
export function addMonths(date: ISODate, months: number): ISODate {
  const d = parseDate(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return isoDate(d);
}
export function addYears(date: ISODate, years: number): ISODate {
  return addMonths(date, 12 * years);
}
export function addBusinessDays(instant: string, days: number): string {
  const d = new Date(instant);
  while (days > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days--;
  }
  return d.toISOString();
}
export function deadline(date: ISODate): string {
  return parseDate(date).toISOString();
}
export function localToday(now = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now) as ISODate;
}

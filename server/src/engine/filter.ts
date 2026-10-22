import type { CalendarEvent, CrmEvent } from "../types.js";

function toDate(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (!value.includes(":")) {
    return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }
  return parsed;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function filterCrmsByDate(calendar: CalendarEvent, crms: CrmEvent[]): CrmEvent[] {
  const day = toDate(calendar.start_time);
  if (!day) return [];
  return crms.filter((crm) => {
    const meeting = toDate(crm.meeting_date);
    return meeting !== null && sameDay(day, meeting);
  });
}

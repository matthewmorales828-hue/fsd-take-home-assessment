import { readFile } from "node:fs/promises";
import type { CalendarEvent, CrmEvent } from "./types.js";

async function loadEvents<T>(filename: string): Promise<T[]> {
  const path = new URL(`../data/${filename}`, import.meta.url);
  const events: unknown = JSON.parse(await readFile(path, "utf8"));

  if (!Array.isArray(events)) {
    throw new Error(`${filename} must contain a JSON array`);
  }

  return events as T[];
}

export const [calendarEvents, crmEvents] = await Promise.all([
  loadEvents<CalendarEvent>("calendar_events.json"),
  loadEvents<CrmEvent>("crm_events.json"),
]);

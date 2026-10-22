import type { CalendarEvent, CalendarMatchResult, CrmEvent } from "./types";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // keep the status text
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const fetchCalendarEvents = (signal?: AbortSignal) =>
  getJson<CalendarEvent[]>("/api/calendar", signal);

export const fetchCrmEvents = (signal?: AbortSignal) => getJson<CrmEvent[]>("/api/crm", signal);

export const fetchMatch = (calendarId: string, signal?: AbortSignal) =>
  getJson<CalendarMatchResult>(`/api/calendar/${encodeURIComponent(calendarId)}/match`, signal);

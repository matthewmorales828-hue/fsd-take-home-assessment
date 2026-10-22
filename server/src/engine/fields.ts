import { calendarEvents, crmEvents } from "../data.js";
import type { ExtractedField, FieldMatch } from "../types.js";
import { MODEL, openai } from "./openai.js";

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function extractFields(records: object[]): ExtractedField[] {
  const types = new Map<string, Set<string>>();

  for (const record of records) {
    for (const [name, value] of Object.entries(record)) {
      if (!types.has(name)) types.set(name, new Set());
      types.get(name)!.add(valueType(value));
    }
  }

  return [...types].map(([name, set]) => ({ name, type: [...set].sort().join(" | ") }));
}

const matchPrompt = (calendar: ExtractedField[], crm: ExtractedField[]): string => `Compare these calendar and CRM field schemas and decide which fields should be compared when reconciling one calendar event to one CRM event.
  Calendar fields:
  ${JSON.stringify(calendar)}
  CRM fields:
  ${JSON.stringify(crm)}
  Return JSON with this shape:
  {"matches":[{"calendarFields":["<calendar_field>"],"crmFields":["<crm_field>"],"weight":1}]}
  Rules:
  - Create a separate match entry in "matches" for each distinct meeting dimension:
    1. Topic & organization: heading/title/subject fields on one side vs heading/subject and organization/company fields on the other side.
    2. Start schedule: start timestamp on one side vs date and start-time fields on the other side (omit end-time or duration fields if the other schema only records a start time).
    3. Participants: all person/participant fields (both host/organizer/owner and attendees/contacts) together in one participant group so internal and external meetings alike have non-empty participant data on both sides.
    4. Venue: physical or virtual location fields in their own group.
    5. Status / commentary: separate low-weight groups for meeting status and for free-text notes/descriptions.
  - Never merge two different dimensions (such as topic, schedule, and participants) into a single match entry.
  - Use only field names from the schemas above.
  - Weights are positive numbers and must sum to exactly 100.
  - Distribute ~85–90 of the total weight across dimensions 1–4 (e.g. 25–30 each for topic, schedule, and participants; 10 for venue) and give 5 or less each to status and commentary.
  - Leave out record identifiers, recurrence flags, and audit timestamps.`;

const parseMatches = (
  raw: string,
  calendar: ExtractedField[],
  crm: ExtractedField[],
): FieldMatch[] => {
  const parsed: unknown = JSON.parse(raw);
  const matches = (parsed as { matches?: unknown }).matches;
  if (!Array.isArray(matches)) {
    throw new Error(`Model response is missing a "matches" array: ${raw}`);
  }

  const calendarNames = new Set(calendar.map((f) => f.name));
  const crmNames = new Set(crm.map((f) => f.name));
  const onlyKnown = (fields: unknown, known: Set<string>): string[] =>
    Array.isArray(fields) ? fields.filter((f): f is string => typeof f === "string" && known.has(f)) : [];

  const cleaned = matches
    .map((m: { calendarFields?: unknown; crmFields?: unknown; weight?: unknown }) => ({
      calendarFields: onlyKnown(m.calendarFields, calendarNames),
      crmFields: onlyKnown(m.crmFields, crmNames),
      weight: Number(m.weight),
    }))
    .filter((m) => m.calendarFields.length && m.crmFields.length && m.weight > 0);

  if (!cleaned.length) {
    throw new Error(`Model returned no usable matches: ${raw}`);
  }

  const total = cleaned.reduce((sum, m) => sum + m.weight, 0);
  return cleaned.map((m) => ({ ...m, weight: (m.weight / total) * 100 }));
};

const computeFieldMatches = async (): Promise<FieldMatch[]> => {
  const calendar = extractFields(calendarEvents);
  const crm = extractFields(crmEvents);

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: matchPrompt(calendar, crm) }],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model returned an empty response");
  }

  return parseMatches(content, calendar, crm);
};

let fieldMatches: Promise<FieldMatch[]> | undefined;

/** Schema comparison. Depends only on field names and types, so it runs once. */
export const fetchFieldMatches = (): Promise<FieldMatch[]> => {
  fieldMatches ??= computeFieldMatches().catch((err: unknown) => {
    fieldMatches = undefined;
    throw err;
  });
  return fieldMatches;
};

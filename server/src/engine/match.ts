import { crmEvents } from "../data.js";
import { filterCrmsByDate } from "./filter.js";
import type {
  CalendarEvent,
  CalendarMatchResult,
  CrmCandidateScore,
  CrmEvent,
  FieldMatch,
  FieldScore,
  ReviewField,
} from "../types.js";
import { MODEL, openai } from "./openai.js";

const SCORE_BATCH_SIZE = Number(process.env.SCORE_BATCH_SIZE ?? 5);
const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? 80);
const REVIEW_FLOOR = 60;

const HIDDEN_FIELDS = new Set(["event_id", "crm_id", "created_at"]);

const visibleFields = (record: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([name]) => !HIDDEN_FIELDS.has(name)));

const scorePrompt = (
  calendar: CalendarEvent,
  candidates: CrmEvent[],
  matches: FieldMatch[],
): string => {
  const groups = matches
    .map((m, i) => `${i}. calendar [${m.calendarFields.join(", ")}] vs crm [${m.crmFields.join(", ")}]`)
    .join("\n  ");

  const crmRecords = candidates.map((c) => ({ crmId: c.crm_id, ...visibleFields(c) }));

  return `You are reconciling one calendar event against a list of CRM meeting records.
  Calendar event:
  ${JSON.stringify(visibleFields(calendar))}
  CRM records:
  ${JSON.stringify(crmRecords)}
  Field groups to score, in order:
  ${groups}
  For every CRM record, rate each field group, and list the specific fields a person must review before trusting the pair.
  Return JSON with this shape:
  {"candidates":[{"crmId":"id","scores":[0.9,0.5],"reviewFields":[{"calendarFields":["field"],"crmFields":["field"],"note":"why a person should check these values"}]}]}
  Rules:
  - Include exactly one entry per CRM record, using its crmId.
  - "scores" must contain exactly ${matches.length} numbers between 0 and 1, one per field group in the order listed above.
  - Score each group from the values of the named fields, using the rest of both records as context. Do not assume any field names beyond those listed.
  - 1.0 means the two sides refer to the same fact. 0.0 means they contradict or are unrelated.
  - Score 0.9–1.0 when the meaning matches even if the wording, format, or which field holds the fact differs: paraphrased headings or notes, a name vs a matching email, a company or person named in a heading on one side and in its own field on the other, a timestamp vs a split date and time, abbreviations, or extra people alongside the primary contact.
  - Score 0.8–0.9 when the same day is clear but the start time is only slightly different.
  - Do not lower a score because a field is null or missing on one side when that field does not apply (for example an external-contact field on an internal meeting), or because one record has extra detail the other schema does not store.
  - Do not compute totals or weights; only report the per-group scores.
  - "reviewFields" is for genuine contradictions only, including fields that are not in a scored group. Each entry must include calendarFields, crmFields, and note.
  - "note" is a short/brief disclaimer a reviewer can read: state what disagrees and what to verify. Keep it short and avoid technical jargon. Use only field names that appear on the records above.
  - Flag a pair when both sides state incompatible facts (different day, a non-trivial time shift, virtual vs in-person venue, or an active status vs cancelled).
  - Do not flag paraphrases, extra detail, extra attendees, or a fact that appears in a different field on the other record.
  - Return an empty "reviewFields" array when nothing conflicts. Do not repeat the same pair.`;
};

const parseScores = (
  raw: string,
  calendar: CalendarEvent,
  candidates: CrmEvent[],
  matches: FieldMatch[],
): CrmCandidateScore[] => {
  const parsed: unknown = JSON.parse(raw);
  const list = (parsed as { candidates?: unknown }).candidates;
  if (!Array.isArray(list)) {
    throw new Error(`Model response is missing a "candidates" array: ${raw}`);
  }

  const calendarNames = new Set(Object.keys(visibleFields(calendar)));
  const crmNames = new Set(candidates.flatMap((c) => Object.keys(visibleFields(c))));
  const known = (fields: unknown, names: Set<string>): string[] =>
    Array.isArray(fields)
      ? [...new Set(fields.filter((f): f is string => typeof f === "string" && names.has(f)))]
      : [];

  const byId = new Map<string, { scores: number[]; reviewFields: ReviewField[] }>();
  for (const entry of list as { crmId?: unknown; scores?: unknown; reviewFields?: unknown }[]) {
    if (typeof entry.crmId !== "string" || !Array.isArray(entry.scores)) continue;
    const reviewFields = Array.isArray(entry.reviewFields)
      ? entry.reviewFields.flatMap((item) => {
          const row = item as { calendarFields?: unknown; crmFields?: unknown; note?: unknown };
          const calendarFields = known(row.calendarFields, calendarNames);
          const crmFields = known(row.crmFields, crmNames);
          const note = typeof row.note === "string" ? row.note.trim() : "";
          return calendarFields.length && crmFields.length ? [{ calendarFields, crmFields, note }] : [];
        })
      : [];
    byId.set(entry.crmId, { scores: entry.scores.map(Number), reviewFields });
  }

  const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

  return candidates.map((crm) => {
    const raw = byId.get(crm.crm_id);
    const scores = matches.map((m, i) => ({ ...m, score: clamp(raw?.scores[i] ?? 0) }));
    const total = scores.reduce((sum, s) => sum + s.weight * s.score, 0);
    return { crmId: crm.crm_id, total, scores, reviewFields: raw?.reviewFields ?? [] };
  });
};

/** Scores one calendar event against CRM records using field groups computed ahead of time. */
export const matchCalendarToCrm = async (
  calendar: CalendarEvent,
  matches: FieldMatch[],
  candidates: CrmEvent[] = crmEvents,
): Promise<CalendarMatchResult> => {
  const filteredCandidates = filterCrmsByDate(calendar, candidates);
  if (!matches.length || !filteredCandidates.length) {
    return { calendarId: calendar.event_id, best: null, candidates: [] };
  }

  const scored: CrmCandidateScore[] = [];
  for (let i = 0; i < filteredCandidates.length; i += SCORE_BATCH_SIZE) {
    const batch = filteredCandidates.slice(i, i + SCORE_BATCH_SIZE);

    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: scorePrompt(calendar, batch, matches) }],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Model returned an empty response");
    }

    scored.push(...parseScores(content, calendar, batch, matches));
  }

  scored.sort((a, b) => b.total - a.total);
  const best = scored[0] ?? null;

  const worthReviewing = best !== null && best.total >= REVIEW_FLOOR;
  const flagged: FieldScore[] = worthReviewing
    ? best.reviewFields.map((review) => {
        const group = best.scores.find(
          (s) =>
            review.calendarFields.every((f) => s.calendarFields.includes(f)) &&
            review.crmFields.every((f) => s.crmFields.includes(f)),
        );
        return group ? { ...group, ...review } : { ...review, weight: 0, score: 0 };
      })
    : [];
  flagged.sort((a, b) => b.weight - a.weight);

  const inReviewBand = worthReviewing && best.total < MATCH_THRESHOLD;
  const reviewRequired = inReviewBand || flagged.length ? flagged : undefined;

  return { calendarId: calendar.event_id, best, candidates: scored, reviewRequired };
};

export interface CalendarEvent {
  event_id: string;
  title: string;
  organizer: string;
  attendees: string[];
  start_time: string;
  end_time: string;
  location: string | null;
  description: string | null;
  is_recurring: boolean;
  status: "confirmed" | "tentative" | "cancelled";
  created_at: string;
}

export interface CrmEvent {
  crm_id: string;
  subject: string;
  client_name: string | null;
  client_company: string | null;
  relationship_owner: string;
  meeting_date: string;
  meeting_time: string | null;
  meeting_type: "In-Person" | "Virtual" | "Internal";
  location: string | null;
  notes: string;
  status: "Completed" | "Confirmed" | "Scheduled" | "Cancelled" | "Tentative";
  created_at: string;
}

export interface FieldScore {
  calendarFields: string[];
  crmFields: string[];
  weight: number;
  score: number;
  note?: string;
}

export interface CrmCandidateScore {
  crmId: string;
  total: number;
  scores: FieldScore[];
}

export interface CalendarMatchResult {
  calendarId: string;
  best: CrmCandidateScore | null;
  candidates: CrmCandidateScore[];
  /** Present when the model flagged fields to check, or the total is in the review band. */
  reviewRequired?: FieldScore[];
}

export type MatchStatus = "matched" | "review" | "unmatched";

/** Must agree with MATCH_THRESHOLD in server/src/engine/match.ts. */
export const MATCH_THRESHOLD = 80;

export function matchStatus(result: CalendarMatchResult): MatchStatus {
  if (result.reviewRequired) return "review";
  const total = result.best?.total;
  if (total !== undefined && total >= MATCH_THRESHOLD) return "matched";
  return "unmatched";
}

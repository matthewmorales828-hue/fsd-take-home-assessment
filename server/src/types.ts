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
  status: string | null;
  created_at: string;
}

export interface ExtractedField {
  name: string;
  type: string;
}

export interface FieldMatch {
  calendarFields: string[];
  crmFields: string[];
  weight: number;
}

export interface FieldScore extends FieldMatch {
  score: number;
  note?: string;
}

export interface ReviewField {
  calendarFields: string[];
  crmFields: string[];
  /** Model-written disclaimer explaining why these fields need a human check. */
  note: string;
}

export interface CrmCandidateScore {
  crmId: string;
  total: number;
  scores: FieldScore[];
  /** Fields the model says a person should compare on this candidate. */
  reviewFields: ReviewField[];
}

export interface CalendarMatchResult {
  calendarId: string;
  best: CrmCandidateScore | null;
  candidates: CrmCandidateScore[];
  /** Field groups the model flagged on the best match. Set for review-band matches, and for matched results that still disagree on some groups. */
  reviewRequired?: FieldScore[];
}

export interface CrmEvent {
  crm_id: string;
  subject: string;
  client_name: string | null;
  client_company: string | null;
  relationship_owner: string;
  meeting_date: string;
  meeting_time: string | null;
  meeting_type: string | null;
  location: string | null;
  notes: string;
  status: string | null;
  created_at: string;
}

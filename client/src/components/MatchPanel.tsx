import type { CalendarEvent, CalendarMatchResult, CrmEvent } from "../types";
import { matchStatus } from "../types";
import { formatDate, formatTime, formatValue } from "../format";
import { StatusBadge } from "./StatusBadge";
import { FieldIssues } from "./FieldIssues";

interface Props {
  calendar: CalendarEvent;
  result: CalendarMatchResult | undefined;
  loading: boolean;
  error: string | null;
  crmById: Map<string, CrmEvent>;
  onRetry: () => void;
}

export function MatchPanel({ calendar, result, loading, error, crmById, onRetry }: Props) {
  return (
    <div className="match-panel">
      <CalendarHeader calendar={calendar} />

      {loading && (
        <section className="panel loading">
          <div className="spinner" />
          <div>
            <strong>Scoring against CRM records…</strong>
            <p className="muted">
              The model compares this event with every CRM record. This usually takes 15–30 seconds.
            </p>
          </div>
        </section>
      )}

      {error && (
        <section className="panel error">
          <strong>Could not load match.</strong> {error}
          <div>
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        </section>
      )}

      {result && !loading && <MatchResult calendar={calendar} result={result} crmById={crmById} />}
    </div>
  );
}

function CalendarHeader({ calendar }: { calendar: CalendarEvent }) {
  return (
    <section className="panel">
      <div className="panel-kicker">Calendar event · {calendar.event_id}</div>
      <h2>{calendar.title}</h2>
      <dl className="kv">
        <dt>When</dt>
        <dd>
          {formatDate(calendar.start_time)}, {formatTime(calendar.start_time)}–{formatTime(calendar.end_time)}
        </dd>
        <dt>Organizer</dt>
        <dd>{calendar.organizer}</dd>
        <dt>Attendees</dt>
        <dd>{formatValue(calendar.attendees)}</dd>
        <dt>Location</dt>
        <dd>{formatValue(calendar.location)}</dd>
        <dt>Status</dt>
        <dd>{calendar.status}</dd>
        <dt>Recurring</dt>
        <dd>{formatValue(calendar.is_recurring)}</dd>
        {calendar.description && (
          <>
            <dt>Description</dt>
            <dd>{calendar.description}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function MatchResult({
  calendar,
  result,
  crmById,
}: {
  calendar: CalendarEvent;
  result: CalendarMatchResult;
  crmById: Map<string, CrmEvent>;
}) {
  const status = matchStatus(result);

  // Nothing scored high enough to be worth showing; the closest record would only mislead.
  if (status === "unmatched" || !result.best) {
    return (
      <section className="panel">
        <div className="match-head">
          <div>
            <div className="panel-kicker">Matched CRM record</div>
            <h3 className="muted">None</h3>
          </div>
          <StatusBadge status="unmatched" />
        </div>
      </section>
    );
  }

  const best = result.best;
  const crm = crmById.get(best.crmId);

  return (
    <>
      <section className="panel">
        <div className="match-head">
          <div>
            <div className="panel-kicker">Matched CRM record · {best.crmId}</div>
            <h3>{crm?.subject ?? best.crmId}</h3>
          </div>
          <div className="match-score">
            <div className={`score-total score-${status}`}>{best.total.toFixed(1)}%</div>
            <StatusBadge status={status} />
          </div>
        </div>

        {crm && (
          <dl className="kv">
            <dt>Client</dt>
            <dd>
              {formatValue(crm.client_name)}
              {crm.client_company ? ` · ${crm.client_company}` : ""}
            </dd>
            <dt>Owner</dt>
            <dd>{crm.relationship_owner}</dd>
            <dt>When</dt>
            <dd>
              {crm.meeting_date}
              {crm.meeting_time ? ` ${crm.meeting_time}` : ""}
            </dd>
            <dt>Type</dt>
            <dd>{crm.meeting_type}</dd>
            <dt>Location</dt>
            <dd>{formatValue(crm.location)}</dd>
            <dt>Status</dt>
            <dd>{crm.status}</dd>
            <dt>Notes</dt>
            <dd>{crm.notes}</dd>
          </dl>
        )}
      </section>

      {result.reviewRequired && (
        <FieldIssues fields={result.reviewRequired} calendar={calendar} crm={crm} />
      )}
    </>
  );
}

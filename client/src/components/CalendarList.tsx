import type { CalendarEvent, MatchStatus } from "../types";
import { formatDate, formatTime } from "../format";
import { StatusBadge } from "./StatusBadge";

interface Props {
  events: CalendarEvent[];
  selectedId: string | null;
  /** Match status for events that have already been analysed. */
  statuses: Record<string, MatchStatus>;
  onSelect: (id: string) => void;
}

export function CalendarList({ events, selectedId, statuses, onSelect }: Props) {
  return (
    <ul className="calendar-list">
      {events.map((event) => {
        const status = statuses[event.event_id];
        return (
          <li key={event.event_id}>
            <button
              type="button"
              className={`calendar-item${event.event_id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(event.event_id)}
            >
              <div className="calendar-item-head">
                <span className="calendar-item-title">{event.title}</span>
                {status && <StatusBadge status={status} />}
              </div>
              <div className="calendar-item-meta muted">
                {formatDate(event.start_time)} · {formatTime(event.start_time)}–{formatTime(event.end_time)}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

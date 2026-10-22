import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCalendarEvents, fetchCrmEvents, fetchMatch } from "./api";
import type { CalendarEvent, CalendarMatchResult, CrmEvent, MatchStatus } from "./types";
import { matchStatus } from "./types";
import { CalendarList } from "./components/CalendarList";
import { MatchPanel } from "./components/MatchPanel";

interface MatchState {
  loading: boolean;
  error: string | null;
  result?: CalendarMatchResult;
}

export default function App() {
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [crm, setCrm] = useState<CrmEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, MatchState>>({});

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchCalendarEvents(controller.signal), fetchCrmEvents(controller.signal)])
      .then(([cal, crmRecords]) => {
        setCalendar(cal);
        setCrm(crmRecords);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, []);

  const loadMatch = useCallback((id: string) => {
    setMatches((prev) => ({ ...prev, [id]: { loading: true, error: null } }));
    fetchMatch(id)
      .then((result) => setMatches((prev) => ({ ...prev, [id]: { loading: false, error: null, result } })))
      .catch((err: unknown) =>
        setMatches((prev) => ({
          ...prev,
          [id]: { loading: false, error: err instanceof Error ? err.message : String(err) },
        })),
      );
  }, []);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      const existing = matches[id];
      if (!existing || (existing.error && !existing.loading)) loadMatch(id);
    },
    [matches, loadMatch],
  );

  const crmById = useMemo(() => new Map(crm.map((c) => [c.crm_id, c])), [crm]);

  const statuses = useMemo(() => {
    const out: Record<string, MatchStatus> = {};
    for (const [id, state] of Object.entries(matches)) {
      if (state.result) out[id] = matchStatus(state.result);
    }
    return out;
  }, [matches]);

  const selected = calendar.find((c) => c.event_id === selectedId) ?? null;
  const selectedMatch = selectedId ? matches[selectedId] : undefined;

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-head">
          <h1>Calendar events</h1>
          <span className="muted">{calendar.length}</span>
        </header>
        {loadError ? (
          <div className="panel error">
            <strong>Could not load data.</strong> {loadError}
            <p className="muted small">Is the API server running on port 3000?</p>
          </div>
        ) : (
          <CalendarList events={calendar} selectedId={selectedId} statuses={statuses} onSelect={select} />
        )}
      </aside>

      <main className="content">
        {selected ? (
          <MatchPanel
            calendar={selected}
            result={selectedMatch?.result}
            loading={selectedMatch?.loading ?? false}
            error={selectedMatch?.error ?? null}
            crmById={crmById}
            onRetry={() => loadMatch(selected.event_id)}
          />
        ) : (
          <div className="empty">
            <h2>Select a calendar event</h2>
            <p className="muted">
              The matching CRM record, its score, and any fields that need review will appear here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

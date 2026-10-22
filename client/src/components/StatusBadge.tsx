import type { MatchStatus } from "../types";

const LABELS: Record<MatchStatus, string> = {
  matched: "Matched",
  review: "Review required",
  unmatched: "Unmatched",
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>;
}

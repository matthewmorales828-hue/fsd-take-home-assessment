# Leads API

Minimal Node.js, Express, and TypeScript server.

## Development

```sh
npm install
npm run dev
```

The server defaults to port 3000. Set `PORT` to override it.

Before listening, the server loads `data/calendar_events.json` and
`data/crm_events.json` into memory. Startup fails if either file is missing,
contains invalid JSON, or is not an array. File paths resolve relative to the
server module in both development and compiled builds.

## Reconciliation

Startup reconciles the loaded records before listening. Logs show `matching`,
each final `matched` / `review` / `unmatched` result, and a `done` summary.
Results include ranked candidates and a score breakdown, and remain in memory.

Each record is normalized before scoring: case and punctuation are folded,
common abbreviations are expanded, dates become YYYY-MM-DD (including
MM-DD/YYYY), and people are compared from email local-parts and display names.
Notes and descriptions are not compared. A calendar title with no meaningful
overlap against the CRM subject, client name, and company is not a candidate.

Scores:
- Title versus subject + client name + company: 50, by share of title words covered.
- Date: 30 for the same calendar date.
- Time: 5 for the same HH:mm. Explicit calendar timezones score 0.
- Organizer versus relationship owner: 5.
- Client name versus attendees: 5.
- Location: 3, from token overlap. Meeting type: 2, inferred from attendees
  and venue without using the CRM label.

The default match threshold is 80, configurable with MATCH_THRESHOLD (60–100).
Scores from 60 through 79, and pairs within 3 points, need review. Without a
matching date the maximum is 70. Multiple calendar entries may match one CRM
record and receive duplicate warnings. Discrepancies remain visible; no source
records are modified. Run `npm test` for regression checks.

## Health check

```sh
curl http://localhost:3000/health
```

Returns HTTP 200 with `{"status":"ok"}`.

## Client API

- `GET /api/calendar` returns all calendar events.
- `GET /api/calendar/:id/reconciliation` returns the stored reconciliation
  result, match threshold, and best CRM candidate (or `null`). Unknown event
  IDs return HTTP 404.

The React client in `../client` proxies these endpoints to this server.

## Build and run

```sh
npm run build
npm start
```

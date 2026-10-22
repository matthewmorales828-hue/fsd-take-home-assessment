# Calendar / CRM Reconciliation

Matches each calendar event to the CRM meeting that describes the same conversation: which record, how confident the score is, and which fields disagree if a human should review it. Scoring is done by OpenAI (`gpt-4o-mini` by default; override with `OPENAI_MODEL`) and shown in a small review UI.

---

## 1. Setup

### Prerequisites

- Node.js 22 or later
- An OpenAI API key

### Configure

Create `server/.env`:

```env
OPEN_AI_KEY=sk-...                 # required
OPENAI_MODEL=gpt-4o-mini           # optional
PORT=3000                          # optional; client proxy expects 3000
MATCH_THRESHOLD=80                 # optional; total at or above this is a match
SCORE_BATCH_SIZE=5                 # optional; CRM records scored per model call
```

The client has no environment variables. All of these are read by the server except `PORT` on the Vite proxy, which defaults to `http://localhost:3000`.

### Install and run

From the repository root:

```sh
npm start
```

That is `install:all` followed by `dev`: it installs the root workspace, `server/`, and `client/`, then starts both processes:

- **server** — `tsx watch` on [http://localhost:3000](http://localhost:3000)
- **client** — Vite on [http://localhost:5173](http://localhost:5173); `/api/*` is proxied to the server

Open [http://localhost:5173](http://localhost:5173). `Ctrl+C` stops both.

To run the steps separately:

```sh
npm run install:all   # root + server + client dependencies
npm run dev           # server and client in watch mode
npm run build         # tsc for the server, tsc + vite build for the client
```

One side only: `npm run dev --prefix server` or `npm run dev --prefix client`.

### Verify

```sh
curl http://localhost:3000/health
# {"status":"ok"}

curl http://localhost:3000/api/calendar/CAL-A1/match
```

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness: `{"status":"ok"}` |
| `GET` | `/api/calendar` | All calendar events |
| `GET` | `/api/crm` | All CRM records |
| `GET` | `/api/analyze` | Field groups and weights from stage 1 |
| `GET` | `/api/calendar/:id/match` | Reconciliation for one event; `404` if unknown |

---

## 2. Matching logic

The engine never hard-codes which fields to compare. `server/src/engine/fields.ts` asks the model which fields belong together and how much each group is worth. `server/src/engine/match.ts` then scores one calendar event against same-day CRM records. The server only validates the model's JSON and does the arithmetic.

```
  schemas only          Stage 1: field mapping           FieldMatch[]
  ───────────────────▶  which fields compare,      ───▶  (cached for the process)
                        and how important?

  one calendar event    date filter                      same-day CRM only
  ───────────────────▶  calendar.start_time vs     ───▶
                        crm.meeting_date

  event + CRM batch     Stage 2: scoring                 per-group scores 0..1
  (mapped fields)  ───▶ how similar is each        ───▶  + reviewFields
                        field group?

                        Aggregate + classify
                        total = Σ weight × score
                        matched / review / unmatched
```

### Stage 1 — Field mapping (`fetchFieldMatches`)

**Input:** schemas, not records. `extractFields()` walks both datasets and collects the union of field names with observed types, e.g. `{ name: "location", type: "null | string" }`.

**Prompt:** the model builds many-to-many groups, one per meeting dimension, using only names from those schemas:

1. Topic and organization (title/subject vs subject + company)
2. Start schedule (start timestamp vs date + start time; no end-time if CRM has none)
3. Participants (organizer/owner and attendees/contacts in one group)
4. Venue
5. Status and commentary (separate low-weight groups)

Identifiers, recurrence flags, and audit timestamps are left out. Weights are positive and must sum to 100, with most of the mass on dimensions 1–4.

**Output:** `FieldMatch[]`, for example:

```json
[
  { "calendarFields": ["title"], "crmFields": ["subject", "client_company"], "weight": 28 },
  { "calendarFields": ["start_time"], "crmFields": ["meeting_date", "meeting_time"], "weight": 27 },
  { "calendarFields": ["organizer", "attendees"], "crmFields": ["relationship_owner", "client_name"], "weight": 25 },
  { "calendarFields": ["location"], "crmFields": ["location"], "weight": 10 },
  { "calendarFields": ["status"], "crmFields": ["status"], "weight": 5 },
  { "calendarFields": ["description"], "crmFields": ["notes"], "weight": 5 }
]
```

**Validation (`parseMatches`):** unknown field names are dropped, empty or non-positive groups are removed, and weights are renormalised to sum to exactly 100.

This stage depends only on the schemas, so it runs once at process start (`temperature: 0`, JSON mode) and is reused for every event.

### Stage 2 — Scoring (`matchCalendarToCrm`)

**Date filter.** CRM records that do not share the calendar event's calendar day are never sent to the model. `filterCrmsByDate` parses `calendar.start_time` and `crm.meeting_date` with `new Date` and compares year/month/date. Date-only CRM values are treated as UTC calendar days.

If there are no field groups or no same-day CRM records, the result is unmatched (`best: null`, empty `candidates`).

**Prompt.** Remaining CRM records are scored in batches of `SCORE_BATCH_SIZE` (default 5). Identifiers and `created_at` are stripped. Each batch prompt contains:

- the calendar event, reduced to visible fields
- the CRM records, each tagged with `crmId`
- the numbered field groups

The model returns, per CRM record:

- one similarity score in `[0, 1]` per group, in group order
- `reviewFields`: genuine contradictions a person should check, each with a short `note`

It is told to judge meaning, not string equality (name vs matching email, company inside a title, timestamp vs split date/time, abbreviations). It must not lower a score for a null that does not apply, or for extra detail the other schema does not store. It must not compute totals. `reviewFields` is for real conflicts only (different day, non-trivial time shift, virtual vs in-person, active vs cancelled) — not paraphrases or extra attendees.

**Validation (`parseScores`):** scores are clamped to `[0, 1]`; missing or non-numeric values become `0`; omitted records score `0` across the board. Review field names that are not on the records are dropped.

### Aggregation and classification

For every CRM candidate:

\[
\text{total} = \sum_{g} \text{weight}_g \times \text{score}_g \quad \in [0, 100]
\]

Candidates are sorted by total descending; the top one is `best`.

| Condition | Status | `reviewRequired` |
|---|---|---|
| `total ≥ MATCH_THRESHOLD` (default 80) and the model flagged nothing | **matched** | omitted |
| `total ≥ MATCH_THRESHOLD` but the model flagged conflicts | **review** | those flagged fields |
| `60 ≤ total < MATCH_THRESHOLD` | **review** | flagged fields (may be empty) |
| `total < 60` or no candidates | **unmatched** | omitted |

The UI uses the same rule: any present `reviewRequired` is **review**; otherwise a total at or above the threshold is **matched**. Flagged groups that line up with a scored group keep that group's weight and score; unmatched flags are attached with weight and score `0`. They are sorted heaviest-weight first.

`reviewRequired` is the explanation of *why* the pair is not trusted yet — the fields that disagree, plus the model's note of what to verify.

### Response shape

```ts
interface CalendarMatchResult {
  calendarId: string;
  best: CrmCandidateScore | null;     // highest-scoring CRM record
  candidates: CrmCandidateScore[];    // all same-day CRM records, total desc
  reviewRequired?: FieldScore[];      // set in the review band, or when the best match still conflicts
}

interface CrmCandidateScore {
  crmId: string;
  total: number;                      // 0..100
  scores: FieldScore[];               // one per field group
  reviewFields: ReviewField[];        // model-flagged contradictions on this candidate
}

interface FieldScore {
  calendarFields: string[];
  crmFields: string[];
  weight: number;                     // share of 100
  score: number;                      // 0..1 from the model
  note?: string;                      // present on flagged review fields
}
```
"# fsd-take-home-assessment" 

import express from "express";
import { calendarEvents, crmEvents } from "./data.js";
import { fetchFieldMatches } from "./engine/fields.js";
import { matchCalendarToCrm } from "./engine/match.js";

console.log(
  `Loaded ${calendarEvents.length} calendar events and ${crmEvents.length} CRM events`,
);

const fieldMatches = await fetchFieldMatches();
console.log(`Field matches ready (${fieldMatches.length} groups)`);

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/calendar", (_req, res) => {
  res.json(calendarEvents);
});

app.get("/api/crm", (_req, res) => {
  res.json(crmEvents);
});

app.get("/api/analyze", (_req, res) => {
  res.json(fieldMatches);
});

app.get("/api/calendar/:id/match", async (req, res) => {
  const calendar = calendarEvents.find((c) => c.event_id === req.params.id);
  if (!calendar) return res.status(404).json({ message: "Calendar event not found" });
  res.json(await matchCalendarToCrm(calendar, fieldMatches));
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

import type { CalendarEvent, CrmEvent, FieldScore } from "../types";
import { formatValue } from "../format";

interface Props {
  fields: FieldScore[];
  calendar: CalendarEvent;
  crm: CrmEvent | undefined;
}

const read = (record: object | undefined, field: string): unknown =>
  record ? (record as Record<string, unknown>)[field] : undefined;

/** Lists the review-required field groups with the values from both records side by side. */
export function FieldIssues({ fields, calendar, crm }: Props) {
  return (
    <section className="panel issues-panel">
      <h3>Review required</h3>
      <p className="muted">
        The model flagged these fields because the values do not fully agree. Compare them and confirm or reject the match.
      </p>

      {fields.length === 0 ? (
        <p className="muted">The model did not flag an individual field. The overall score is in the review range.</p>
      ) : (
        <table className="issues-table">
          <thead>
            <tr>
              <th>Calendar</th>
              <th>CRM</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={i}>
                <td>
                  {f.calendarFields.map((name) => (
                    <div key={name} className="field-value">
                      <span className="field-name">{name}</span>
                      <span>{formatValue(read(calendar, name))}</span>
                    </div>
                  ))}
                </td>
                <td>
                  {f.crmFields.map((name) => (
                    <div key={name} className="field-value">
                      <span className="field-name">{name}</span>
                      <span>{formatValue(read(crm, name))}</span>
                    </div>
                  ))}
                </td>
                <td className="field-note muted">{f.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

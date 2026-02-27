/**
 * Pure iCalendar (RFC 5545) builder for inventory expiry reminder events.
 * No DB calls — accepts CalendarBatch data from the caller.
 */

export type CalendarBatch = {
  /** Batch UUID */
  id: string;
  /** ISO date YYYY-MM-DD, nullable — null batches are silently skipped */
  expiryDate: string | null;
  quantity: number;
  itemName: string;
  itemUnit: string;
  storageLocationName: string | null;
};

/** Fixed reminder offsets in days before expiry (MVP: 30 / 7 / 1). */
export const REMINDER_OFFSETS_DAYS = [30, 7, 1] as const;

/**
 * Returns the reminder event date (YYYY-MM-DD) by subtracting offsetDays
 * from the given expiryDate.
 */
export function reminderDate(expiryDate: string, offsetDays: number): string {
  const [y, m, d] = expiryDate.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Builds a stable, deterministic UID for a batch + offset pair.
 * Same inputs always produce the same UID, enabling calendar client de-duplication.
 */
export function buildEventUid(batchId: string, offsetDays: number): string {
  return `prepstock-batch-${batchId}-offset-${offsetDays}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Converts YYYY-MM-DD → YYYYMMDD (iCal DATE format). */
function toIcsDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

/** Adds one calendar day to an ISO date string, returning ISO date. */
function addOneDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Formats a Date as iCal DTSTAMP value: YYYYMMDDTHHMMSSZ */
function formatDtStamp(now: Date): string {
  const iso = now.toISOString(); // e.g. "2026-02-27T12:34:56.789Z"
  const datePart = iso.slice(0, 10).replace(/-/g, ""); // "20260227"
  const timePart = iso.slice(11, 19).replace(/:/g, ""); // "123456"
  return `${datePart}T${timePart}Z`;
}

/**
 * Folds a single iCal property line per RFC 5545 §3.1 (75-character chunks).
 * Continuation lines are prefixed with a single SPACE.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let pos = 75;
  while (pos < line.length) {
    chunks.push(" " + line.slice(pos, pos + 74));
    pos += 74;
  }
  return chunks.join("\r\n");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Builds a complete VCALENDAR string from the given batches.
 *
 * - Batches with null expiryDate are skipped (R1).
 * - Each qualifying batch generates one VEVENT per offset in REMINDER_OFFSETS_DAYS (R2).
 * - All lines use CRLF endings per RFC 5545.
 * - Lines are folded at 75 characters.
 */
export function buildExpiryIcs(batches: CalendarBatch[]): string {
  const dtStamp = formatDtStamp(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PrepStock//Expiry Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  const expiringBatches = batches.filter(
    (b): b is CalendarBatch & { expiryDate: string } => b.expiryDate !== null,
  );

  for (const batch of expiringBatches) {
    for (const offset of REMINDER_OFFSETS_DAYS) {
      const startIso = reminderDate(batch.expiryDate, offset);
      const endIso = addOneDay(startIso);
      const location = batch.storageLocationName ?? "-";

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${buildEventUid(batch.id, offset)}`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(startIso)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(endIso)}`);
      lines.push(`SUMMARY:${batch.itemName} 到期提醒（${offset} 天前）`);
      lines.push(
        `DESCRIPTION:到期日：${batch.expiryDate}\\n數量：${batch.quantity} ${batch.itemUnit}\\n儲存位置：${location}`,
      );
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

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
 * Escapes RFC 5545 TEXT property values.
 * Must escape: backslash, comma, semicolon, and newlines (RFC 5545 §3.3.11).
 * Backslash must be escaped first to avoid double-escaping.
 * CRLF, CR, and LF are all normalized to \n (the iCal literal escape).
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\") // \ → \\ (must be first)
    .replace(/,/g, "\\,") //  , → \,
    .replace(/;/g, "\\;") //  ; → \;
    .replace(/\r\n|\r|\n/g, "\\n"); // embedded newlines → \n (RFC 5545 §3.3.11)
}

/**
 * Folds a single iCal property line per RFC 5545 §3.1 (75 octets max).
 * Uses UTF-8 byte length (not JS string length) to correctly handle multibyte
 * characters (e.g. Chinese). Continuation lines are prefixed with a single SPACE
 * (1 byte), leaving 74 bytes of content per continuation chunk.
 * Never splits in the middle of a Unicode code point.
 */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, "utf-8") <= 75) return line;

  const chunks: string[] = [];
  let pos = 0;

  while (pos < line.length) {
    const isFirst = chunks.length === 0;
    const maxBytes = isFirst ? 75 : 74; // continuation lines: 1 byte for leading space
    let chunk = "";
    let chunkBytes = 0;

    while (pos < line.length) {
      // Use codePointAt to handle surrogate pairs (emoji etc.) atomically.
      const cp = line.codePointAt(pos)!;
      const char = String.fromCodePoint(cp);
      const charBytes = Buffer.byteLength(char, "utf-8");
      if (chunkBytes + charBytes > maxBytes) break;
      chunk += char;
      chunkBytes += charBytes;
      pos += char.length; // 1 for BMP, 2 for supplementary (surrogate pair)
    }

    if (chunk.length === 0) {
      // Safety: a single code point exceeds maxBytes (cannot happen for valid UTF-8
      // with maxBytes ≥ 4), but guard against infinite loop.
      const cp = line.codePointAt(pos)!;
      chunk = String.fromCodePoint(cp);
      pos += chunk.length;
    }

    chunks.push(chunk);
  }

  return chunks.length === 1
    ? chunks[0]
    : chunks[0] + chunks.slice(1).map((c) => `\r\n ${c}`).join("");
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
 * - Lines are folded at 75 UTF-8 octets (RFC 5545 §3.1).
 * - User-supplied TEXT values are escaped per RFC 5545 §3.3.11.
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
    // Escape user-supplied TEXT values per RFC 5545 §3.3.11.
    const safeItemName = escapeText(batch.itemName);
    const safeItemUnit = escapeText(batch.itemUnit);
    const safeLocation = escapeText(batch.storageLocationName ?? "-");

    for (const offset of REMINDER_OFFSETS_DAYS) {
      const startIso = reminderDate(batch.expiryDate, offset);
      const endIso = addOneDay(startIso);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${buildEventUid(batch.id, offset)}`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(startIso)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(endIso)}`);
      lines.push(`SUMMARY:${safeItemName} 到期提醒（${offset} 天前）`);
      lines.push(
        `DESCRIPTION:到期日：${batch.expiryDate}\\n數量：${batch.quantity} ${safeItemUnit}\\n儲存位置：${safeLocation}`,
      );
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

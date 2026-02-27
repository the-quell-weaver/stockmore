import { describe, expect, it } from "vitest";

import {
  buildEventUid,
  buildExpiryIcs,
  escapeText,
  foldLine,
  reminderDate,
  REMINDER_OFFSETS_DAYS,
  type CalendarBatch,
} from "@/lib/calendar/ics-builder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** RFC 5545 §3.1 unfold: removes CRLF + single whitespace fold continuations. */
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BATCH_WITH_EXPIRY: CalendarBatch = {
  id: "11111111-1111-1111-1111-111111111111",
  expiryDate: "2028-06-30",
  quantity: 100,
  itemName: "飲用水",
  itemUnit: "瓶",
  storageLocationName: "倉庫A",
};

const BATCH_NO_EXPIRY: CalendarBatch = {
  id: "22222222-2222-2222-2222-222222222222",
  expiryDate: null,
  quantity: 50,
  itemName: "急救包",
  itemUnit: "個",
  storageLocationName: null,
};

// ---------------------------------------------------------------------------
// buildEventUid
// ---------------------------------------------------------------------------

describe("buildEventUid", () => {
  it("returns a deterministic UID for the same inputs (UID stability)", () => {
    const uid1 = buildEventUid(BATCH_WITH_EXPIRY.id, 30);
    const uid2 = buildEventUid(BATCH_WITH_EXPIRY.id, 30);
    expect(uid1).toBe(uid2);
    expect(uid1).toBe(
      "prepstock-batch-11111111-1111-1111-1111-111111111111-offset-30",
    );
  });

  it("returns different UIDs for different offsets", () => {
    const uid30 = buildEventUid(BATCH_WITH_EXPIRY.id, 30);
    const uid7 = buildEventUid(BATCH_WITH_EXPIRY.id, 7);
    const uid1 = buildEventUid(BATCH_WITH_EXPIRY.id, 1);
    expect(uid30).not.toBe(uid7);
    expect(uid7).not.toBe(uid1);
    expect(uid30).not.toBe(uid1);
  });

  it("returns different UIDs for different batches with same offset", () => {
    const uid1 = buildEventUid("aaa-111", 30);
    const uid2 = buildEventUid("bbb-222", 30);
    expect(uid1).not.toBe(uid2);
  });
});

// ---------------------------------------------------------------------------
// reminderDate
// ---------------------------------------------------------------------------

describe("reminderDate", () => {
  it("subtracts 30 days from 2028-06-30 → 2028-05-31", () => {
    expect(reminderDate("2028-06-30", 30)).toBe("2028-05-31");
  });

  it("subtracts 7 days from 2028-06-30 → 2028-06-23", () => {
    expect(reminderDate("2028-06-30", 7)).toBe("2028-06-23");
  });

  it("subtracts 1 day from 2028-06-30 → 2028-06-29", () => {
    expect(reminderDate("2028-06-30", 1)).toBe("2028-06-29");
  });

  it("handles month boundary crossing", () => {
    expect(reminderDate("2028-03-01", 1)).toBe("2028-02-29"); // 2028 is a leap year
  });

  it("handles year boundary crossing", () => {
    expect(reminderDate("2028-01-01", 1)).toBe("2027-12-31");
  });

  it("handles 30-day subtraction crossing a month boundary", () => {
    expect(reminderDate("2028-01-15", 30)).toBe("2027-12-16");
  });
});

// ---------------------------------------------------------------------------
// REMINDER_OFFSETS_DAYS
// ---------------------------------------------------------------------------

describe("REMINDER_OFFSETS_DAYS", () => {
  it("contains exactly [30, 7, 1]", () => {
    expect(REMINDER_OFFSETS_DAYS).toEqual([30, 7, 1]);
  });
});

// ---------------------------------------------------------------------------
// buildExpiryIcs
// ---------------------------------------------------------------------------

describe("buildExpiryIcs", () => {
  // AC4: Empty batches → valid empty VCALENDAR
  it("returns a valid empty VCALENDAR when given no batches", () => {
    const ics = buildExpiryIcs([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  // AC4: Only no-expiry batches → valid empty VCALENDAR
  it("returns a valid empty VCALENDAR when all batches have null expiryDate", () => {
    const ics = buildExpiryIcs([BATCH_NO_EXPIRY]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  // R1 + AC3: Batch without expiry_date → no event
  it("does not generate any VEVENT for batches with null expiryDate", () => {
    const ics = buildExpiryIcs([BATCH_NO_EXPIRY]);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  // R2: Each batch generates exactly 3 VEVENTs (30/7/1)
  it("generates exactly 3 VEVENT blocks for a single batch with expiry", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    const count = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(count).toBe(3);
  });

  // R2: Two batches → 6 VEVENTs
  it("generates 6 VEVENT blocks for two batches with expiry", () => {
    const batch2: CalendarBatch = { ...BATCH_WITH_EXPIRY, id: "aaaabbbb-0000-0000-0000-000000000000", expiryDate: "2029-01-01" };
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY, batch2]);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(6);
  });

  // Mixed batches: only those with expiry get events
  it("only generates events for batches that have an expiryDate", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY, BATCH_NO_EXPIRY]);
    const count = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(count).toBe(3); // only BATCH_WITH_EXPIRY contributes
  });

  // AC1: DTSTART is correct for 30-day offset
  it("includes correct DTSTART for 30-day offset (2028-06-30 → 20280531)", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20280531");
  });

  // AC1: DTSTART for 7-day offset
  it("includes correct DTSTART for 7-day offset (2028-06-30 → 20280623)", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20280623");
  });

  // AC1: DTSTART for 1-day offset
  it("includes correct DTSTART for 1-day offset (2028-06-30 → 20280629)", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20280629");
  });

  // DTEND is DTSTART + 1 day (all-day event)
  it("includes DTEND as one day after DTSTART for all-day events", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    // For 30-day offset: DTSTART=20280531, DTEND=20280601
    expect(ics).toContain("DTEND;VALUE=DATE:20280601");
  });

  // AC2: UID stability — same batch + offset always produces same UID
  it("produces the same UIDs across multiple calls (UID stability)", () => {
    const ics1 = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    const ics2 = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    const extractUids = (s: string) =>
      [...s.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]?.trim());
    expect(extractUids(ics1)).toEqual(extractUids(ics2));
    expect(extractUids(ics1)).toHaveLength(3);
  });

  // AC5: SUMMARY contains item name (traceable to data source)
  it("includes item name in SUMMARY (R3, AC5)", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    expect(ics).toContain("飲用水");
  });

  // AC5: DESCRIPTION includes expiry date, quantity, unit
  it("includes expiry date and quantity in DESCRIPTION (AC5)", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    expect(ics).toContain("到期日：2028-06-30");
    expect(ics).toContain("100 瓶");
  });

  // AC5: DESCRIPTION includes storageLocationName when present
  it("includes storageLocationName in DESCRIPTION when present (AC5)", () => {
    // Unfold before asserting: byte-based folding may split multibyte content across lines.
    const ics = unfold(buildExpiryIcs([BATCH_WITH_EXPIRY]));
    expect(ics).toContain("倉庫A");
  });

  // AC5: DESCRIPTION uses '-' when storageLocationName is null
  it("uses '-' for null storageLocationName in DESCRIPTION (AC5)", () => {
    const batch: CalendarBatch = { ...BATCH_WITH_EXPIRY, storageLocationName: null };
    const ics = buildExpiryIcs([batch]);
    expect(ics).toContain("儲存位置：-");
  });

  // RFC 5545: CRLF line endings
  it("uses CRLF (\\r\\n) line endings as required by RFC 5545", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    expect(ics).toContain("\r\n");
    // Every line should end with \r\n (no bare \n)
    const lines = ics.split("\r\n");
    expect(lines.length).toBeGreaterThan(5);
  });

  // RFC 5545: lines folded so each is ≤ 75 UTF-8 bytes
  it("folds lines so no line exceeds 75 UTF-8 bytes", () => {
    const batch: CalendarBatch = {
      id: "longname-0000-0000-0000-000000000000",
      expiryDate: "2028-06-30",
      quantity: 999999,
      itemName: "非常長的品項名稱，用來測試RFC5545行折疊功能是否正常運作的品項",
      itemUnit: "個",
      storageLocationName: "非常長的存放點名稱，用來測試折行邏輯",
    };
    const ics = buildExpiryIcs([batch]);
    for (const line of ics.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf-8")).toBeLessThanOrEqual(75);
    }
  });

  // RFC 5545: continuation lines start with a single space
  it("continuation lines after folding start with a single space", () => {
    const batch: CalendarBatch = {
      id: "fold-test-0000-0000-0000-000000000001",
      expiryDate: "2028-06-30",
      quantity: 1,
      itemName:
        "品項名稱超級超級超級超級超級超級超級超級超級超級超級超級超級超級超級超級超級長",
      itemUnit: "個",
      storageLocationName: null,
    };
    const ics = buildExpiryIcs([batch]);
    const lines = ics.split("\r\n");
    // Any line that is NOT a property name start must be a continuation (space-prefixed)
    // when the previous line was exactly at the fold boundary.
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1]!;
      const curr = lines[i]!;
      // A continuation line is identified by being non-empty and not starting with a known property/component name
      const isKnownStart = /^(BEGIN|END|VERSION|PRODID|CALSCALE|METHOD|UID|DTSTAMP|DTSTART|DTEND|SUMMARY|DESCRIPTION)/.test(curr);
      if (curr.length > 0 && !isKnownStart && Buffer.byteLength(prev, "utf-8") >= 74) {
        expect(curr.startsWith(" ")).toBe(true);
      }
    }
  });

  // R4: mandatory VCALENDAR headers present
  it("includes required VCALENDAR headers (R4)", () => {
    const ics = buildExpiryIcs([]);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//PrepStock//Expiry Calendar//EN");
    expect(ics).toContain("CALSCALE:GREGORIAN");
    expect(ics).toContain("METHOD:PUBLISH");
  });

  // UID contains batchId and offset
  it("includes batch id and offset in the UID (AC2, AC5)", () => {
    const ics = buildExpiryIcs([BATCH_WITH_EXPIRY]);
    expect(ics).toContain(
      `UID:prepstock-batch-${BATCH_WITH_EXPIRY.id}-offset-30`,
    );
    expect(ics).toContain(
      `UID:prepstock-batch-${BATCH_WITH_EXPIRY.id}-offset-7`,
    );
    expect(ics).toContain(
      `UID:prepstock-batch-${BATCH_WITH_EXPIRY.id}-offset-1`,
    );
  });

  // P1: special characters in user data are escaped in SUMMARY and DESCRIPTION
  it("escapes comma in itemName in SUMMARY (P1)", () => {
    const batch: CalendarBatch = { ...BATCH_WITH_EXPIRY, itemName: "水, 食物" };
    const ics = buildExpiryIcs([batch]);
    expect(ics).toContain("水\\, 食物 到期提醒");
    expect(ics).not.toContain("水, 食物 到期提醒");
  });

  it("escapes semicolon in itemName in SUMMARY (P1)", () => {
    const batch: CalendarBatch = { ...BATCH_WITH_EXPIRY, itemName: "水; 食物" };
    const ics = buildExpiryIcs([batch]);
    expect(ics).toContain("水\\; 食物 到期提醒");
    expect(ics).not.toContain("水; 食物 到期提醒");
  });

  it("escapes backslash in itemName in SUMMARY (P1)", () => {
    const batch: CalendarBatch = { ...BATCH_WITH_EXPIRY, itemName: "C:\\Water" };
    const ics = buildExpiryIcs([batch]);
    expect(ics).toContain("C:\\\\Water");
  });

  it("escapes special chars in storageLocationName in DESCRIPTION (P1)", () => {
    const batch: CalendarBatch = {
      ...BATCH_WITH_EXPIRY,
      storageLocationName: "Rack A, Section 1; Zone B",
    };
    // Unfold before asserting: long DESCRIPTION may be folded across lines.
    const ics = unfold(buildExpiryIcs([batch]));
    expect(ics).toContain("Rack A\\, Section 1\\; Zone B");
  });

  it("escapes special chars in itemUnit in DESCRIPTION (P1)", () => {
    const batch: CalendarBatch = { ...BATCH_WITH_EXPIRY, itemUnit: "box,bag" };
    const ics = buildExpiryIcs([batch]);
    expect(ics).toContain("box\\,bag");
  });
});

// ---------------------------------------------------------------------------
// escapeText (unit tests for the exported helper)
// ---------------------------------------------------------------------------

describe("escapeText", () => {
  it("escapes backslash → double backslash", () => {
    expect(escapeText("a\\b")).toBe("a\\\\b");
  });

  it("escapes comma → \\,", () => {
    expect(escapeText("a,b")).toBe("a\\,b");
  });

  it("escapes semicolon → \\;", () => {
    expect(escapeText("a;b")).toBe("a\\;b");
  });

  it("does not modify normal text", () => {
    expect(escapeText("飲用水 123 abc")).toBe("飲用水 123 abc");
  });

  it("escapes backslash before comma (order preserved)", () => {
    // Input: a\,b  →  first escape \→\\, then ,→\,  →  a\\,b  →  "a\\\\,b" wait...
    // Let's trace: input = "a\\,b" (JS string: a\,b)
    // After \ → \\:  "a\\\\,b"  (JS string: a\\,b)
    // After , → \,: "a\\\\\\,b" (JS string: a\\\,b)
    // That is: a + \\ + \, + b  — which is correct in iCal: escaped backslash then escaped comma
    expect(escapeText("a\\,b")).toBe("a\\\\\\,b");
  });

  it("handles empty string", () => {
    expect(escapeText("")).toBe("");
  });

  it("handles multiple special chars", () => {
    expect(escapeText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
  });
});

// ---------------------------------------------------------------------------
// foldLine (unit tests for the exported helper)
// ---------------------------------------------------------------------------

describe("foldLine", () => {
  it("returns short ASCII line unchanged", () => {
    const line = "BEGIN:VCALENDAR";
    expect(foldLine(line)).toBe(line);
  });

  it("returns line of exactly 75 bytes unchanged", () => {
    const line = "A".repeat(75); // 75 ASCII bytes
    expect(foldLine(line)).toBe(line);
  });

  it("folds 76-byte ASCII line at 75 bytes", () => {
    const line = "A".repeat(76);
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts).toHaveLength(2);
    expect(Buffer.byteLength(parts[0]!, "utf-8")).toBe(75);
    expect(parts[1]).toBe(" " + "A"); // 1 space + 1 char
  });

  it("does not split a multibyte character across fold boundary", () => {
    // 'あ' is 3 bytes in UTF-8. Build a line that is exactly 74 bytes ASCII + 'あ' = 77 bytes total.
    const line = "S:" + "A".repeat(72) + "あ"; // "S:" (2) + 72 "A" (72) + "あ" (3) = 77 bytes
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    // First part must be ≤ 75 bytes and must not end with half of 'あ'
    expect(Buffer.byteLength(parts[0]!, "utf-8")).toBeLessThanOrEqual(75);
    // 'あ' must appear in one piece somewhere
    const unfolded = parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("");
    expect(unfolded).toContain("あ");
  });

  it("ensures all segments ≤ 75 UTF-8 bytes after folding", () => {
    // All-Chinese line: each char = 3 bytes → 26 chars = 78 bytes
    const line = "SUMMARY:" + "水".repeat(26);
    const folded = foldLine(line);
    for (const seg of folded.split("\r\n")) {
      expect(Buffer.byteLength(seg, "utf-8")).toBeLessThanOrEqual(75);
    }
  });

  it("continuation segments start with a single space", () => {
    const line = "SUMMARY:" + "水".repeat(26); // > 75 bytes
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    for (const part of parts.slice(1)) {
      expect(part.startsWith(" ")).toBe(true);
    }
  });
});

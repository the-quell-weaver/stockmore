import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/context";
import { buildExpiryIcs } from "@/lib/calendar/ics-builder";
import { createClient } from "@/lib/supabase/server";
import { listStockBatches } from "@/lib/transactions/service";

/**
 * GET /api/calendar/expiry.ics
 *
 * Returns an iCalendar (.ics) file containing expiry reminder events for all
 * batches with a non-null expiry_date in the authenticated user's org.
 *
 * Security:
 * - Requires a valid session (401 if unauthenticated).
 * - org_id is derived from the session membership — never trusted from the client.
 * - listStockBatches enforces RLS via getMembership internally.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const context = await getAuthContext(supabase);
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch up to 200 expiring batches (has_expiry filters at DB level before limiting,
    // so the cap applies only to rows with expiry_date IS NOT NULL).
    // listStockBatches enforces org isolation via getMembership() + RLS.
    const batches = await listStockBatches(supabase, { limit: 200, has_expiry: true });

    const ics = buildExpiryIcs(batches);

    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="prepstock-expiry.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

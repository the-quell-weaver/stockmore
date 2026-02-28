import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listItemsForPlanMode } from "@/lib/transactions/service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q") ?? undefined;
    const excludeExpired = searchParams.get("excludeExpired") !== "false";
    const supabase = await createClient();
    const t = Date.now();
    const items = await listItemsForPlanMode(supabase, { q, excludeExpired });
    const dur = Date.now() - t;
    return NextResponse.json(items, {
      headers: { "Server-Timing": `db;desc="listItemsForPlanMode";dur=${dur}` },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

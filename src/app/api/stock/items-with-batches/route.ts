import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listItemsWithBatches } from "@/lib/transactions/service";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    const supabase = await createClient();
    const t = Date.now();
    const items = await listItemsWithBatches(supabase, { q });
    const dur = Date.now() - t;
    return NextResponse.json(items, {
      headers: { "Server-Timing": `db;desc="listItemsWithBatches";dur=${dur}` },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

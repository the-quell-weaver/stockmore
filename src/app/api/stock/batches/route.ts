import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listStockBatches } from "@/lib/transactions/service";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    const supabase = await createClient();
    const t = Date.now();
    const batches = await listStockBatches(supabase, { q });
    const dur = Date.now() - t;
    return NextResponse.json(batches, {
      headers: { "Server-Timing": `db;desc="listStockBatches";dur=${dur}` },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

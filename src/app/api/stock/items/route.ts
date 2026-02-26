import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listItems } from "@/lib/items/service";

export async function GET() {
  try {
    const supabase = await createClient();
    const t = Date.now();
    const items = await listItems(supabase);
    const dur = Date.now() - t;
    return NextResponse.json(items, {
      headers: { "Server-Timing": `db;desc="listItems";dur=${dur}` },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

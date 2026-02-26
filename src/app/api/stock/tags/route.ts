import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listTags } from "@/lib/tags/service";

export async function GET() {
  try {
    const supabase = await createClient();
    const t = Date.now();
    const tags = await listTags(supabase);
    const dur = Date.now() - t;
    return NextResponse.json(tags, {
      headers: { "Server-Timing": `db;desc="listTags";dur=${dur}` },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

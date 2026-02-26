import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listStorageLocations } from "@/lib/storage-locations/service";

export async function GET() {
  try {
    const supabase = await createClient();
    const t = Date.now();
    const locations = await listStorageLocations(supabase);
    const dur = Date.now() - t;
    return NextResponse.json(locations, {
      headers: { "Server-Timing": `db;desc="listStorageLocations";dur=${dur}` },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

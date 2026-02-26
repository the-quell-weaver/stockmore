import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listStorageLocations } from "@/lib/storage-locations/service";

export async function GET() {
  try {
    const supabase = await createClient();
    const locations = await listStorageLocations(supabase);
    return NextResponse.json(locations);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listTags } from "@/lib/tags/service";

export async function GET() {
  try {
    const supabase = await createClient();
    const tags = await listTags(supabase);
    return NextResponse.json(tags);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

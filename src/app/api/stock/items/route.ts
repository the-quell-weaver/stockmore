import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listItems } from "@/lib/items/service";

export async function GET() {
  try {
    const supabase = await createClient();
    const items = await listItems(supabase);
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([], { status: 401 });
  }
}

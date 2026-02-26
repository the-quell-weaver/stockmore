import { Suspense } from "react";

import { getAuthContext } from "@/lib/auth/context";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { StockPageClient } from "@/components/stock-page-client";

async function StockContent() {
  const supabase = await createClient();
  await requireUser(supabase, "/stock");

  const context = await getAuthContext(supabase);
  const warehouseName = context?.warehouseName ?? "—";

  return <StockPageClient warehouseName={warehouseName} />;
}

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <StockContent />
    </Suspense>
  );
}

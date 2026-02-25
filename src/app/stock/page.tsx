import { Suspense } from "react";

import { getAuthContext } from "@/lib/auth/context";
import { requireUser } from "@/lib/auth/require-user";
import { listItems } from "@/lib/items/service";
import { listStorageLocations } from "@/lib/storage-locations/service";
import { createClient } from "@/lib/supabase/server";
import { listTags } from "@/lib/tags/service";
import { listStockBatches } from "@/lib/transactions/service";
import { StockPageClient } from "@/components/stock-page-client";

type StockSearchParams = { q?: string | string[] };

type StockPageProps = {
  searchParams: Promise<StockSearchParams>;
};

async function StockContent({
  searchParams,
}: {
  searchParams: Promise<StockSearchParams>;
}) {
  const rawParams = await searchParams;
  const q = Array.isArray(rawParams.q) ? rawParams.q[0] : rawParams.q;
  const supabase = await createClient();
  await requireUser(supabase, "/stock");

  const context = await getAuthContext(supabase);
  const warehouseName = context?.warehouseName ?? "—";

  const [batches, items, locations, tags] = await Promise.all([
    listStockBatches(supabase, { q }),
    listItems(supabase),
    listStorageLocations(supabase),
    listTags(supabase),
  ]);

  return (
    <StockPageClient
      batches={batches}
      items={items}
      locations={locations}
      tags={tags}
      q={q}
      warehouseName={warehouseName}
    />
  );
}

export default function StockPage({ searchParams }: StockPageProps) {
  return (
    <Suspense fallback={null}>
      <StockContent searchParams={searchParams} />
    </Suspense>
  );
}

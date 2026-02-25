# Gap Plan: Client-Side Caching for Reference Data

## Context

Batches 1–4 addressed points 2–6 of the original feature request (grouped list, modals, hamburger menu,
field removal). The only unaddressed point is the performance/SPA section (point 1):

> 盡量只在必要時與 backend 溝通 / 維持 client side state cache / Vercel CPU time 上升快速

**Concrete regression introduced by Batch 3:**
`stock/page.tsx` now makes **4 parallel DB calls per page load** (batches, items, locations, tags)
vs. the original **2** (batches, items). Locations and tags are reference data that almost never
change — fetching them fresh on every navigation is unnecessary and contributes directly to the
Vercel CPU time concern.

**Compression:** Vercel auto-applies gzip/brotli at the edge. No config change needed.
**Event sourcing:** Architecture-level; out of scope.

---

## Approach: TanStack Query client-side cache

After the first `/stock` page load, locations and tags are already in the browser. Subsequent
modal opens (InboundModal, LocationsModal, TagsModal) should read from the client cache instead
of triggering a new server render. TanStack Query is the standard mechanism in the React ecosystem
for this.

**Trade-off considered:** Next.js `unstable_cache` / React `cache()` only deduplicates within a
single request — they don't help across navigations. Client-side cache is the right level.

---

## Implementation

### Step 1 — Install

```bash
cd src && npm install @tanstack/react-query
```

(No devtools needed in production; skip `@tanstack/react-query-devtools` to keep bundle lean.)

### Step 2 — QueryClientProvider

**New file: `src/components/query-provider.tsx`** ("use client")

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000 } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

`staleTime: 5 min` — locations and tags change rarely; 5 minutes is safe.

**New file: `src/app/stock/layout.tsx`** (Server Component — wraps all `/stock/**`)

```tsx
import { QueryProvider } from "@/components/query-provider";
export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
```

### Step 3 — API routes for reference data

Three thin GET handlers that authenticate via Supabase server client and return JSON:

- **`src/app/api/stock/locations/route.ts`** → calls `listStorageLocations(supabase)`, returns JSON
- **`src/app/api/stock/tags/route.ts`** → calls `listTags(supabase)`, returns JSON
- **`src/app/api/stock/items/route.ts`** → calls `listItems(supabase)`, returns JSON

All three: no caching headers on the response (TanStack manages staleness client-side).

### Step 4 — Query keys

**New file: `src/lib/query-keys.ts`**

```ts
export const queryKeys = {
  locations: ["stock", "locations"] as const,
  tags: ["stock", "tags"] as const,
  items: ["stock", "items"] as const,
};
```

### Step 5 — Remove locations/tags/items from server-side fetches

**Modify `src/app/stock/page.tsx`:**
- Remove `listStorageLocations` and `listTags` from `Promise.all` (revert to 2 calls: batches + items)
- Remove `listItems` too if Step 6 makes it redundant (see below)
- Remove `locations`, `tags`, `items` from `StockPageClient` props

**Reduce to:**
```ts
const batches = await listStockBatches(supabase, { q });
```

`batches` already carries `itemName` / `itemUnit` via the join. `items` prop in `StockPageClient`
was used only to compute `zeroStockItems`. This can be fetched client-side via `useQuery`.

### Step 6 — Migrate StockPageClient to useQuery

**Modify `src/components/stock-page-client.tsx`:**

Remove `items`, `locations`, `tags` props. Fetch them with `useQuery` + `initialData` from
nothing (first render shows SSR data from `batches`; reference data loads immediately from cache
on repeat visits or fetches on first):

```ts
const { data: locations = [] } = useQuery({
  queryKey: queryKeys.locations,
  queryFn: () => fetch("/api/stock/locations").then((r) => r.json()),
});
const { data: tags = [] } = useQuery({
  queryKey: queryKeys.tags,
  queryFn: () => fetch("/api/stock/tags").then((r) => r.json()),
});
const { data: items = [] } = useQuery({
  queryKey: queryKeys.items,
  queryFn: () => fetch("/api/stock/items").then((r) => r.json()),
});
```

`zeroStockItems` computation stays the same, now using the query result.

**Inbound/Locations/Tags modals:** already receive `locations`/`tags` as props from
`StockPageClient` — no change needed inside the modals since the data flows through the same props.

### Step 7 — Invalidate after mutations

In each modal action success handler, invalidate the relevant query key:

**Modify modal components** — after `result.ok`, before `onSuccess()`:

```ts
import { useQueryClient } from "@tanstack/react-query";
// ...
const queryClient = useQueryClient();
// after successful createLocation:
queryClient.invalidateQueries({ queryKey: queryKeys.locations });
```

Apply to: `locations-modal.tsx` (locations), `tags-modal.tsx` (tags), `inbound-modal.tsx` (items
query if an item's first batch was just created — optional).

---

## Critical files

| File | Change |
|------|--------|
| `src/app/stock/page.tsx` | Remove 3 of 4 fetches; pass only `batches` + `q` + `warehouseName` to client |
| `src/app/stock/layout.tsx` | **New** — wraps stock routes in QueryProvider |
| `src/components/query-provider.tsx` | **New** — QueryClient setup |
| `src/components/stock-page-client.tsx` | Remove locations/tags/items props; add useQuery hooks |
| `src/components/locations-modal.tsx` | Add queryClient.invalidateQueries on success |
| `src/components/tags-modal.tsx` | Add queryClient.invalidateQueries on success |
| `src/app/api/stock/locations/route.ts` | **New** |
| `src/app/api/stock/tags/route.ts` | **New** |
| `src/app/api/stock/items/route.ts` | **New** |
| `src/lib/query-keys.ts` | **New** |

**Unchanged:** all `lib/` services, migrations, existing full-page flows, RLS policies.

---

## Verification

```bash
cd src
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
```

Manual checks:
1. First load of `/stock` — DevTools Network shows 1 server render + 3 XHR fetches to `/api/stock/*`
2. Open InboundModal — no new network request for locations/tags (served from cache)
3. Add a location via LocationsModal → locations list updates immediately; next InboundModal open shows new location without page reload
4. Navigate away and back to `/stock` within 5 min — no new `/api/stock/locations` or `/api/stock/tags` requests
5. `npm run test:e2e:smoke`

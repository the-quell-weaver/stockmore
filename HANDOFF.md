# Session Handoff — TanStack Query Caching

## Branch
`feat/improve-ux`

## What was done this session
Batches 1–4 of the UX improvement plan committed:
- `1240afc` — feat: improve UX with modal flows, grouped stock list, and hamburger menu
- `bfe93d0` — fix: expose inbound for zero-stock items; reset batch cache on modal open

All tests pass (`npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`).

## What needs to be done next
Implement **client-side TanStack Query cache** to reduce DB calls from 4→1 per page load.
Full plan at: `./gap.md`

### Quick summary of changes needed

1. **Install**: `cd src && npm install @tanstack/react-query`

2. **New files to create:**
   - `src/components/query-provider.tsx` — QueryClient wrapper ("use client")
   - `src/app/stock/layout.tsx` — wraps `/stock/**` in QueryProvider (Server Component)
   - `src/lib/query-keys.ts` — `{ locations, tags, items }` query key constants
   - `src/app/api/stock/locations/route.ts` — GET → `listStorageLocations(supabase)`
   - `src/app/api/stock/tags/route.ts` — GET → `listTags(supabase)`
   - `src/app/api/stock/items/route.ts` — GET → `listItems(supabase)`

3. **Modify `src/app/stock/page.tsx`:**
   - Remove `listStorageLocations`, `listTags`, `listItems` from `Promise.all`
   - Keep only `listStockBatches(supabase, { q })`
   - Remove `locations`, `tags`, `items` props from `<StockPageClient />`
   - Keep `batches`, `q`, `warehouseName`

4. **Modify `src/components/stock-page-client.tsx`:**
   - Remove `locations`, `tags`, `items` props
   - Add three `useQuery` hooks fetching from the new API routes
   - `staleTime: 5 * 60_000`

5. **Modify `src/components/locations-modal.tsx` and `src/components/tags-modal.tsx`:**
   - Add `queryClient.invalidateQueries({ queryKey: queryKeys.locations/tags })` on success

### Verification
```bash
cd src
npm run typecheck && npm run lint
npm run test:unit && npm run test:integration
npm run test:e2e:smoke
```
Manual: DevTools Network — first `/stock` load shows 3 XHR to `/api/stock/*`; repeat visits within 5 min show 0.

## Key file paths
- Plan: `./gap.md`
- Next plan doc: `ux-improvement-next.md` (repo root, same content as above)
- Stock page: `src/app/stock/page.tsx`
- Stock client: `src/components/stock-page-client.tsx`
- Locations modal: `src/components/locations-modal.tsx`
- Tags modal: `src/components/tags-modal.tsx`

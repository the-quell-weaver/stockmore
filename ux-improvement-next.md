# UX Improvement — Remaining Tasks

Batches 1–4 have been implemented and committed (`feat/improve-ux`, commit `1240afc`).
The following batch was marked optional and was not executed.

---

## Batch 5（選做）：TanStack Query 快取 Reference Data

**目標**：快取 locations / tags / items（不頻繁變動的參考資料），避免每次 modal 開啟都重新 fetch。

### 安裝

```bash
cd src && npm install @tanstack/react-query @tanstack/react-query-devtools
```

### 新建 `src/app/stock/layout.tsx`（Server Component）

```tsx
import { QueryProviderWrapper } from "@/components/query-provider-wrapper";

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <QueryProviderWrapper>{children}</QueryProviderWrapper>;
}
```

### 新建 `src/components/query-provider-wrapper.tsx`（"use client"）

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProviderWrapper({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }),
  );
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
```

### 新建 API Routes

- `src/app/api/stock/locations/route.ts` → GET，呼叫 `listStorageLocations`，回傳 JSON
- `src/app/api/stock/tags/route.ts` → GET，呼叫 `listTags`，回傳 JSON
- `src/app/api/stock/items/route.ts` → GET，呼叫 `listItems`，回傳 JSON

### 新建 `src/lib/query-keys.ts`

```ts
export const queryKeys = {
  locations: ["locations"],
  tags: ["tags"],
  items: ["items"],
} as const;
```

### 修改 Modal 元件

Replace props-based `locations` / `tags` with `useQuery` inside each modal:

```ts
// Example in inbound-modal.tsx
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

const { data: locations = [] } = useQuery({
  queryKey: queryKeys.locations,
  queryFn: () => fetch("/api/stock/locations").then((r) => r.json()),
  initialData: locationsProp, // from SSR props, avoids loading flash
});
```

On mutation success, invalidate instead of calling `router.refresh()`:

```ts
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();
// after successful action:
queryClient.invalidateQueries({ queryKey: queryKeys.locations });
```

### 驗收

- `npm run typecheck && npm run lint`
- `npm run test:unit && npm run test:integration`
- Manual: open LocationsModal, add a location → modal list updates without full-page reload

---

## Notes

- Batch 5 is a pure performance/UX-polish improvement; the app is fully functional without it.
- Decide whether to implement based on observed latency in production.
- `src/app/stock/layout.tsx` must be created carefully — it wraps all `/stock/**` routes.

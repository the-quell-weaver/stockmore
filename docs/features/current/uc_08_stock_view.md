# UC-08 Current State: Stock View

- Source spec: `docs/features/archived/uc_08_stock_view.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Product Behavior (Current)
- 庫存列表以 batch 為最小粒度平攤顯示，不做聚合。
- 每列至少呈現：品名、數量、到期日（可空）、存放點（可空）、標籤（可空）。
- 提供品名關鍵字搜尋，快速縮小結果。
- 從列表可進入入庫、消耗、盤點流程（寫入邏輯分屬 UC-05/06/07）。

## 2. API / Actions (Current)
- `action listStockBatches(input)`
  - Request: `{ q?, limit? }`
  - Response: `BatchWithRefs[]`
  - Errors: `FORBIDDEN`, `INVALID_QUERY`
  - Note: cursor-based pagination 尚未實作，移 Future Works（低優先）。
- `action getBatchSummary(batchId)`（可選）
  - Response: `{ batch: BatchWithRefs }`
  - Errors: `NOT_FOUND`, `FORBIDDEN`

## 3. Permissions / Security
- owner/editor/viewer: 可讀 stock view。
- 跨租戶讀取必須被 RLS 拒絕。
- Stock view 不直接寫入數量；所有異動必須走交易流程。

## 4. Known Limits
- 不含兩層聚合顯示。
- 不含進階篩選（標籤/存放點/到期狀態/低庫存）與列印輸出。
- Cursor-based pagination 未落地；目前為固定上限的陣列回傳。

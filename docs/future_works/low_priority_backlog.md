# 低優先工作清單（Low Priority Backlog）

> 本清單收錄「暫時結案、非 MVP 阻塞、後續有餘裕再重啟」的工作項目。

## 項目

1. Local Magic Link 登入穩定性（Auth）
- 狀態：暫時結案（待重啟）
- 詳細文件：`docs/future_works/magic_link_local_auth.md`
- 主要原因：本機 loopback host 與 callback 後 session/cookie 判定在特定開發路徑下仍不穩定，需獨立時段做端到端重現與收斂。

2. Email 通知（到期 / 低庫存）
- 狀態：規格後移（待重啟）
- 相關規格：`docs/features/uc/uc_09_notifications.md`、`docs/prd.md`
- 主要原因：2026-02-27 起通知優先序調整為「匯出行事曆通知」優先，Email 通知改列未來項目。

3. UC-11 `listItemsWithBatches` — 在 SQL 層過濾批次（防止 API row cap 截斷）
- 狀態：待重啟（P2）
- 相關位置：`src/lib/transactions/service.ts` — `listItemsWithBatches`
- 問題描述：目前查詢載入 org 所有 quantity > 0 的批次，再於 JS 層依 item_id 過濾。
  Supabase 的 max_rows = 1000，當批次總筆數超過上限，批次資料被截斷後才進行 JS 過濾，
  部分品項的批次將顯示不完整或空白，即使符合條件的批次確實存在。
- 建議修法：在 SQL 查詢加入 `.in("item_id", itemIds)` 條件，或改採分頁方式。

4. UC-11 `listItemsForPlanMode` — 以 SQL 聚合替代 JS 端加總（防止 API row cap 截斷）
- 狀態：待重啟（P2）
- 相關位置：`src/lib/transactions/service.ts` — `listItemsForPlanMode`
- 問題描述：批次加總在 JS 端逐筆計算，查詢沒有 pagination/aggregation。
  API row cap（max_rows = 1000）會導致擁有大量批次的 org 批次被截斷，
  造成 currentStock、deficit、completionPct 靜默計算錯誤。
- 建議修法：改以 SQL `sum(quantity) GROUP BY item_id` 聚合，或明確分頁全量讀取。

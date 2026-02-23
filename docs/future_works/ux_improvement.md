# UX Improvement Backlog

> 本文件記錄已知的 UX 改進項目，這些項目不影響功能正確性或安全性，但改善使用者體驗。
> 每項列出背景說明、目前行為、期望行為，以及改動範圍建議。

---

## UX-01：消耗（consume）與調整（adjust）頁面顯示零庫存批次

**背景**
`listBatchesForItem` 目前回傳指定品項下所有批次，不過濾 `quantity = 0` 的批次。

**目前行為**
消耗頁與調整頁會列出 `quantity = 0` 的批次。使用者若對零庫存批次送出消耗，會收到 `INSUFFICIENT_STOCK` 錯誤。

**期望行為**
- 消耗頁（`/stock/consume`）：只顯示 `quantity > 0` 的批次。若沒有可消耗批次則顯示空狀態提示。
- 調整頁（`/stock/adjust`）：可考慮保留所有批次（含零庫存），因為盤點時確認「空批次」是合理操作。

**改動範圍**
- `src/lib/transactions/service.ts`：`listBatchesForItem` 新增可選 `minQuantity` 參數（或在 consume page server component 中獨立查詢），讓 consume 頁過濾 `quantity > 0`。
- 或：在 consume 頁的 server component 直接加 `.gt("quantity", 0)` filter（最小改動）。
- 相關規格：無需更新 API spec（此為 UI 層決策）；可在 UC_06 spec section 5 補充 UX note。

---

## UX-02：操作成功後重導向丟失 itemId context

**背景**
入庫（inbound）、消耗（consume）、調整（adjust）三個功能在操作成功後，會將使用者導回各自的基礎頁面（不帶 `itemId` 參數）。

**目前行為**
- 入庫成功 → `redirect(/stock/inbound?success=inbound_created)`（無 `itemId`）
- 消耗成功 → `redirect(/stock/consume?success=consumed)`（無 `itemId`）
- 調整成功 → `redirect(/stock/adjust?success=adjusted)`（無 `itemId`）

使用者需要重新從下拉選單選擇同一品項，才能繼續操作同品項的其他批次。

**期望行為**
操作成功後重導向保留 `itemId`，例如：
- `redirect(/stock/consume?itemId=<uuid>&success=consumed)`

這樣使用者可以立即看到同品項的其他批次，繼續操作。

**改動範圍**
- `src/app/stock/inbound/actions.ts`：`createInboundBatchAction`、`addInboundToBatchAction` 從 `formData` 讀取 `itemId` 並帶入 redirect。
- `src/app/stock/consume/actions.ts`：`consumeFromBatchAction` 需從 FormData 讀取 `itemId`；consume page 需在 form 加 `<input type="hidden" name="itemId" value={batch.itemId} />`（或從 selectedItemId 帶入）。
- `src/app/stock/adjust/actions.ts`：同上。
- 無需更新 API spec（此為 UI 層 UX 改進）。

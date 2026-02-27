# UC-07 Current State: Transactions - Adjustment

- Source spec: `docs/features/archived/uc_07_transactions_adjustment.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Product Behavior (Current)
- 盤點/調整採「輸入實際數量」語意，系統自動計算差額。
- 調整數量允許小數，且可調整為 `0`。
- 每次調整都會寫入不可刪除交易紀錄（append-only）。
- 調整不改變批次屬性（到期日/存放點/標籤）。

## 2. API / Actions (Current)
- `action adjustBatchQuantity(input)`
  - Request: `{ batchId, actualQuantity, note?, idempotencyKey }`
  - Response: `{ batch, transaction }`
  - Errors: `BATCH_NOT_FOUND`, `QUANTITY_INVALID`, `FORBIDDEN`, `CONFLICT`

## 3. Permissions / Security
- owner/editor: 可建立 adjustment 交易。
- viewer: 僅可讀。
- 需在同一 DB transaction 內完成：讀取舊值、計算 delta、更新 batch、寫入 transaction。

## 4. Idempotency / Concurrency
- 使用 `idempotency_key` 防重送。
- 同批次併發調整應使用 row lock（`SELECT ... FOR UPDATE`）確保一致性。

## 5. Known Limits
- 不含一次盤點多批次的盤點 session。
- 不含批次屬性更正/轉移交易（另案）。

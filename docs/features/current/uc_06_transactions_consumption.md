# UC-06 Current State: Transactions - Consumption

- Source spec: `docs/features/archived/uc_06_feature_transactions_consumption.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Product Behavior (Current)
- 消耗採手動選批次扣減，不做自動 FIFO/FEFO。
- 消耗數量允許小數。
- 不允許扣到負數；庫存不足會拒絕。
- 每次消耗都會寫入不可刪除交易紀錄（append-only）。
- 消耗不改變批次屬性（到期日/存放點/標籤）。

## 2. API / Actions (Current)
- `action consumeFromBatch(input)`
  - Request: `{ batchId, quantity, note?, idempotencyKey? }`
  - Response: `{ batch, transaction }`
  - Errors: `BATCH_NOT_FOUND`, `QUANTITY_INVALID`, `INSUFFICIENT_STOCK`, `FORBIDDEN`
## 3. Permissions / Security
- owner/editor: 可建立 consumption 交易。
- viewer: 僅可讀。
- 扣減驗證與交易寫入必須在同一 DB transaction，避免競態產生負庫存。

## 4. Idempotency / Concurrency
- 建議 `idempotency_key` + unique(org_id, idempotency_key)。
- 同批次併發消耗應使用 row lock 或 atomic update + `quantity >= requested` 檢查。

## 5. Known Limits
- 不含跨多批次自動拆分扣減。
- 不含退貨專用交易型別（以 inbound/adjustment 處理）。
- 目前無 `listConsumableBatches` API；批次列表統一由 UC-08 `listStockBatches` 提供。

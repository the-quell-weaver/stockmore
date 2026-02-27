# UC-05 Current State: Transactions - Inbound

- Source spec: `docs/features/archived/uc_05_feature_transactions_inbound.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Product Behavior (Current)
- 入庫支援兩種模式：
  - 建立新批次並入庫。
  - 對既有批次加量。
- 入庫數量必須為正整數。
- 每次入庫都會寫入不可刪除的交易紀錄（append-only）。
- 對既有批次加量時，不改變批次既有屬性（到期日/存放點/標籤）。

## 2. API / Actions (Current)
- `action createInboundBatch(input)`
  - Request: `{ itemId, quantity, expiryDate?, storageLocationId?, tagIds?/tagId?, note? }`
  - Response: `{ batch, transaction }`
  - Errors: `ITEM_NOT_FOUND`, `QUANTITY_INVALID`, `FORBIDDEN`
- `action addInboundToBatch(input)`
  - Request: `{ batchId, quantity, note? }`
  - Response: `{ batch, transaction }`
  - Errors: `BATCH_NOT_FOUND`, `QUANTITY_INVALID`, `FORBIDDEN`
- `action listBatchesForItem(itemId)`
  - Response: `{ batches }`

## 3. Permissions / Security
- owner/editor: 可建立 inbound 交易。
- viewer: 僅可讀。
- 交易與批次更新需在同一 DB transaction 完成，並受 org/warehouse 邊界限制。

## 4. Idempotency / Concurrency
- 建議使用 `idempotency_key` 防雙擊重送。
- 同批次併發入庫應使用 row lock 或 atomic update。

## 5. Known Limits
- 不含採購到入庫轉換流程。
- 不含自動合併/拆分等進階批次策略。

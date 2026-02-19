<!-- Generated from template.md for UC-06 -->

# Feature: Transactions — Consumption（消耗/出庫：手動選擇批次並扣減）
- **Doc**: docs/features/transactions-consumption.md
- **Status**: Draft
- **PRD linkage**: UC-06（消耗：手動選擇批次並扣減，產生交易紀錄）
- **Last updated**: 2026-02-19

## 0. Summary
本功能讓使用者把庫存「消耗/出庫」：由使用者手動選擇要扣減的批次（batch），輸入消耗數量後，系統寫入一筆不可刪除的交易/事件紀錄並扣減批次數量。MVP 明確不做自動分配批次（如 FIFO/FEFO）與自動拆分覆寫，避免複雜度；改以「手動選批次」為主要操作。消耗允許小數，以符合部分用量（例如水/藥品分次使用）。

## 1. Goals
- G1: 使用者可從指定批次扣減庫存數量（允許小數）。
- G2: 每次消耗都產生不可刪除的交易紀錄（append-only），可追溯與可重播。
- G3: UI 手機優先，能快速完成常見消耗（少輸入、避免選錯批次）。

## 2. Non-Goals
- NG1: 不做自動分配批次（FIFO/FEFO）與「自動找到可扣批次」。（MVP 由使用者選批次。）
- NG2: 不做負庫存（不允許扣到 < 0）。
- NG3: 不做「開封狀態」欄位（PRD 已移除）。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: 消耗表單：選擇批次 + 輸入消耗數量（可小數）。
- S2: 批次可被搜尋/篩選（至少依 item 名稱關聯，或從 stock view 直接進入批次消耗）。
- S3: 成功後 stock view 中該批次數量更新；交易紀錄可追溯。

### 3.2 Out of scope / Backlog hooks (future)
- 自動分配策略：
  - FEFO（先到期先扣）
  - FIFO（先入先出）
  - 允許使用者覆寫自動建議
- 一次消耗跨多批次（拆分扣減）與「快捷消耗」模板。
- 退貨/回補：以 inbound 或 adjustment 交易處理（或新增 return 事件型別）。

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP：單人等價 owner。
- 未來：
  - owner/editor: 可消耗（建立交易）
  - viewer: 只讀

### 4.2 Multi-tenant constraints
- `batches.org_id`、`transactions.org_id` 必填（並建議綁 `warehouse_id`）。
- RLS 覆蓋：`batches`, `transactions`（以及 `items`, `storage_locations`, `tags` 的讀取）。

## 5. UX (Mobile-first)
### 5.1 Entry points
- Stock view：每個批次列提供 `消耗` 按鈕
- 批次詳情（後續）：`消耗`

### 5.2 Primary flow
1. 使用者在 stock view 找到目標批次，點擊 `消耗`。
2. 消耗表單顯示該批次摘要（品名、到期日、存放點、目前數量）。
3. 使用者輸入消耗數量（可小數，> 0，且不得超過目前數量）。
4. （可選）輸入備註。
5. 送出後回到 stock view，看到該批次數量扣減，並顯示「已扣減」提示。

### 5.3 Alternate / edge flows
- 從「批次選擇」進入：若使用者先點全域 `消耗`，則先選 item → 選 batch（後續可加搜尋/過濾）。
- 批次數量不足：顯示錯誤（不可扣到負數）。
- 批次已為 0：UI 應提示不可再消耗（或仍可進入但送出會失敗）。
- 權限錯誤：viewer 送出會被拒絕。
- 網路/重送：支援重試；避免雙擊造成雙交易（見 8.2）。

### 5.4 UI notes
- 表單預設值：quantity 空白；可提供「快速填入：全部用完」按鈕（= current quantity）。
- 避免選錯批次：在表單上顯示 batch 的到期日/存放點/標籤。
- 桌面版：可在右側顯示批次列表與詳細資訊（後續）。

## 6. Data Model Impact
### 6.1 Entities touched
- Tables: `batches`, `transactions`, `items`
- New columns (if any):
  - `transactions.type = 'consumption'`
  - `transactions.quantity_delta`（負數或獨立欄位 `quantity` + type；建議統一用 signed delta）
  - `transactions.batch_id`, `transactions.item_id`, `transactions.note`
  - `transactions.idempotency_key`（建議，與 UC-05 一致）
- New tables (if any): 無

### 6.2 Constraints & invariants
- 不可刪除：`transactions` append-only。
- 數量規則：
  - consumption quantity > 0
  - 允許小數（依 unit 顯示，不做單位換算）
  - 扣減後 batch.quantity >= 0（禁止負庫存）
- referential integrity：transactions.batch_id → batches.id。

### 6.3 RLS expectations (high level)
- 同 org：owner/editor 可 insert consumption transactions 並更新 batch 數量；viewer 只能 select。
- org 判定：row.org_id 與使用者 membership org_id 相符。

## 7. Domain Rules
- R1: 扣減必須以 DB transaction 保證：
  - 同時寫入交易紀錄 + 更新批次數量。
- R2: 不允許扣到負數；需在同一 transaction 中驗證「扣減前的最新數量」。
- R3: 消耗不改變批次屬性（expiry/location/tag）。
- R4: 交易不可刪除；若填錯，使用者可用後續交易修正（例如 inbound 補回或 adjustment 盤點）。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `action consumeFromBatch(input)`
  - Request: `{ batchId, quantity, note?, idempotencyKey? }`
  - Response: `{ batch, transaction }`
  - AuthZ: owner/editor
  - Validation:
    - batchId 存在且屬於同 org
    - quantity 為正數（可小數）
    - quantity <= batch.current_quantity（以最新值檢查）
  - Failure modes: `BATCH_NOT_FOUND`, `QUANTITY_INVALID`, `INSUFFICIENT_STOCK`, `FORBIDDEN`

- `action listConsumableBatches(query?)`（供全域消耗批次選擇；MVP 可先不用）
  - Response: `{ batches }`
  - AuthZ: authenticated

### 8.2 Idempotency / Concurrency
- 重複送出：
  - 建議 (org_id, idempotency_key) unique；重送回傳同一筆交易。
- 競態：同批次同時消耗
  - 使用 row lock（`SELECT ... FOR UPDATE`）或 atomic update + check：
    - 例如 `UPDATE batches SET quantity = quantity - :q WHERE id = :id AND quantity >= :q` 並檢查 rowcount。
- 交易一致性：transactions + batches 必須同 DB transaction。

## 9. Jobs / Notifications (if applicable)
- 不直接觸發通知；消耗會影響低庫存判斷（UC-09）。

## 10. Export / Portability hooks (architecture requirement)
- 需要被匯出的表/事件：`transactions`（consumption）與 `batches`（或可由交易重播重建 batches）。
- 最小可重建資訊：
  - schema_version
  - transactions: { id, type, batch_id, item_id, quantity_delta, created_at, note }
- replay/rebuild 假設：
  - 依 created_at（或序號）順序重播 transactions，batch.quantity 需可重建且一致。
  - 若採 signed delta：inbound 為 +，consumption 為 -。
- 相容性/版本策略：新增事件型別時需向下相容；舊版匯入至少能忽略未知欄位或拒絕不支援版本。

## 11. Telemetry / Auditability
- audit 欄位：transactions.created_at/by、source、note。
- 查詢：
  - 依 batch 查歷史扣減
  - 依 item 彙總消耗趨勢（後續）

## 12. Acceptance Criteria
- AC1: Given owner/editor And batch.quantity=10 When 消耗 quantity=2.5 Then 產生 1 筆 consumption 交易，且 batch.quantity 變為 7.5。
- AC2: Given batch.quantity=1 When 消耗 quantity=2 Then 失敗並回傳 `INSUFFICIENT_STOCK`，且不產生交易。
- AC3: Given viewer When 嘗試消耗 Then 被拒絕（FORBIDDEN）。
- AC4: Given quantity <= 0 When 送出 Then 顯示驗證錯誤且不產生交易。
- AC5: Given 使用者雙擊送出 When 使用同 idempotency_key 重送 Then 系統只產生 1 筆交易。

## 13. Test Strategy (feature-level)
- Unit tests: quantity 驗證（>0、小數）、insufficient stock mapping、idempotency。
- Integration tests (DB + RLS): viewer 禁止 insert；跨 org batch 不可消耗。
- Concurrency test: 兩個請求同時扣同批次，確保不會扣到負數且只有一個成功（或依序成功）。
- Minimal e2e: 入庫建立批次 → 消耗扣減 → stock view 更新。
- Fixtures: org + owner/editor + item + batch。

## 14. Rollout / Migration Plan (if applicable)
- DB migration steps:
  - 確認 `transactions` 支援 signed quantity_delta（或 type+quantity）。
  - 索引：transactions(batch_id, created_at)。
- Backfill: 不需要。
- Feature flag: 不需要。
- 回滾策略：交易不可逆；回滾僅能停用 UI 入口，保留資料。

## 15. Open Questions
- Q1: `transactions.quantity_delta` 是否統一用 signed number（inbound + / consumption - / adjustment 用差額）？（建議：是，便於 replay。）
- Q2: stock view 是否要隱藏 quantity=0 的批次？（PRD 未要求；MVP 可顯示但置底，或預設顯示。）


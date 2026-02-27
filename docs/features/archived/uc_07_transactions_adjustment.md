<!-- Generated from template.md for UC-07 -->

# Feature: Transactions — Adjustment（盤點/調整：指定批次實際數量）
- **Doc**: docs/features/archived/uc_07_transactions_adjustment.md
- **Status**: Draft
- **PRD linkage**: UC-07（盤點/調整：手動選擇批次並直接指定實際數量，產生交易紀錄）
- **Owner**: TBD
- **Last updated**: 2026-02-19

## 0. Summary
本功能讓使用者進行「盤點/調整」：針對某一個庫存批次（batch），手動輸入該批次的**實際數量**，系統計算差額並寫入一筆不可刪除的交易/事件紀錄（append-only）。此設計讓所有數量變動都可追溯、可重播（replay），並支援未來雲端→自架→本地的資料搬遷。MVP 流程以手機優先，並要求使用者明確選擇批次，避免自動分配造成歧義。

## 1. Goals
- G1: 使用者可針對指定批次輸入「盤點後實際數量」，並完成批次數量更新。
- G2: 每次調整必須產生不可刪除的交易紀錄，支援追溯與重播。
- G3: 支援小數數量（與 PRD 一致：盤點調整允許小數）。

## 2. Non-Goals
- NG1: 不做自動批次分配或自動選批次（MVP 一律手動指定）。
- NG2: 不做批次屬性更正（到期日/存放點/標籤）直接修改；屬後續「更正/轉移」交易。
- NG3: 不做完整盤點清單（一次盤點多批次、掃碼、匯入盤點表）。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: 調整表單：選擇批次 + 輸入「實際數量」+（可選）備註。
- S2: 寫入 1 筆 `transactions`（type='adjustment'）並更新該批次數量。
- S3: 數量允許小數，且允許調整為 0。

### 3.2 Out of scope / Backlog hooks (future)
- 批次更正/轉移：以新交易型別處理（例如 transfer/correction），避免直接更新批次屬性。
- 一次盤點多批次：建立盤點 session（inventory_count）與逐筆明細。
- 盤點差異報表：顯示差異與原因分類。

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP：單人等價 owner。
- 未來：
  - owner/editor：可調整（建立交易）
  - viewer：只讀

### 4.2 Multi-tenant constraints
- `batches.org_id`、`transactions.org_id` 必填（並建議同時綁 `warehouse_id` 以支援未來多倉庫）。
- RLS 覆蓋：`batches`, `transactions`（以及 `items` / 字典表的讀取）。

## 5. UX (Mobile-first)
### 5.1 Entry points
- Stock view 的批次列：`盤點/調整` CTA（或在批次詳情頁）。
- 快速操作入口：搜尋找到批次後一鍵進入調整。

### 5.2 Primary flow
1. 使用者在庫存列表找到目標批次，點 `盤點/調整`。
2. 表單顯示批次摘要（品項、目前數量、到期日/存放點/標籤）。
3. 使用者輸入「實際數量」（允許小數，>=0），可填備註。
4. 送出後回到庫存列表，看到批次數量更新，並顯示「已記錄調整」。

### 5.3 Alternate / edge flows
- 空狀態：若沒有任何批次，提示先入庫（UC-05）。
- 驗證錯誤：實際數量不可為負；格式錯誤（非數字）。
- 權限錯誤：viewer 送出被拒絕。
- 網路/重送：送出失敗可重試；需避免雙擊造成重複交易（見 8.2）。

### 5.4 UI notes
- 表單欄位：actual_quantity（必填）、note（可選）。
- 快速操作：手機上 `儲存` 固定在底部 sticky bar；支援常用小數輸入（例如 0.5）。
- 桌面版：同流程，允許更寬的批次摘要區塊。

## 6. Data Model Impact
### 6.1 Entities touched
- Tables: `batches`, `transactions`, `items`
- New columns (if any):
  - `transactions.type = 'adjustment'`
  - `transactions.quantity_after`（建議：調整後的實際數量）
  - `transactions.quantity_delta`（可選：系統計算差額，可能為負）
  - `transactions.batch_id`, `transactions.item_id`, `transactions.note`, `transactions.idempotency_key`
- New tables (if any): 無

### 6.2 Constraints & invariants
- 不可刪除：`transactions` append-only；錯誤以後續交易修正（等價沖銷）。
- 數量規則：調整實際數量 `actual_quantity >= 0`，允許小數。
- referential integrity：
  - `transactions.batch_id` → `batches.id`
  - `batches.item_id` → `items.id`

### 6.3 RLS expectations (high level)
- 同 org：owner/editor 可 insert adjustment transaction，並更新 batches.quantity；viewer 只能 select。
- org 判定：row.org_id 與使用者 membership org_id 相符。

## 7. Domain Rules
- R1: 「盤點/調整」的語意是**指定實際數量**，不是輸入差額；差額由系統計算。
- R2: 調整必須以 DB transaction 保證一致性：同時寫入交易紀錄 + 更新批次數量。
- R3: 調整不改變批次屬性（到期日/存放點/標籤）。
- R4: 交易不可刪除；若填錯以後續 adjustment 或其他交易修正。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `action adjustBatchQuantity(input)`
  - Request: `{ batchId, actualQuantity, note?, idempotencyKey }`
  - Response: `{ batch, transaction }`
  - AuthZ: owner/editor
  - Validation:
    - batchId 存在且屬於同 org
    - actualQuantity 為 number 且 >= 0
  - Failure modes (error codes/messages): `BATCH_NOT_FOUND`, `QUANTITY_INVALID`, `FORBIDDEN`, `CONFLICT`

### 8.2 Idempotency / Concurrency
- 重複送出（避免雙擊）：
  - `transactions.idempotency_key` unique (org_id, idempotency_key)。
  - 同 key 重送回傳同一筆結果。
- 競態條件：同批次同時調整
  - 在 DB transaction 中對 batch row `SELECT ... FOR UPDATE`，以 last-write-wins（先鎖再更新）確保一致。
- 交易一致性：同一 DB transaction 內完成「讀取舊值 → 計算 delta → 更新 batch → insert transaction」。

## 9. Jobs / Notifications (if applicable)
- 不直接發送通知，但調整會影響低庫存判斷（UC-09）。

## 10. Export / Portability hooks (architecture requirement)
- 需要被匯出的表/事件：`transactions`（type='adjustment'）、`batches`（或可由交易重播重建）。
- 最小可重建資訊：schema_version、org/warehouse ids、batch_id、item_id、quantity_after（或 delta + ordering）、created_at、note。
- replay/rebuild 假設：
  - 建議以交易序列重播得到 batches.quantity；adjustment 事件以 quantity_after 作為權威值（可校正漂移）。
- 相容性/版本策略：事件 payload 版本化（schema_version）；新增欄位需可向後相容。

## 11. Telemetry / Auditability
- audit 欄位：transactions.created_at/by、source（web/api）、note。
- 查詢：依 batch/item 查近期調整紀錄；顯示差額（delta）以便追溯。

## 12. Acceptance Criteria
- AC1: Given owner/editor And 批次目前數量為 10 When 調整實際數量為 8 Then 產生 1 筆 adjustment 交易，且批次數量變為 8。
- AC2: Given owner/editor When 調整實際數量為 0 Then 批次數量為 0，且交易紀錄保留。
- AC3: Given viewer When 嘗試調整 Then 被拒絕（FORBIDDEN）。
- AC4: Given actualQuantity < 0 或非數字 When 送出 Then 顯示驗證錯誤且不產生交易。
- AC5: Given 使用者雙擊送出 When 使用相同 idempotencyKey 重送 Then 系統只產生 1 筆交易。

## 13. Test Strategy (feature-level)
- Unit tests: quantity 驗證（>=0、格式）、delta 計算、idempotency mapping。
- Integration tests (DB + RLS): viewer 禁止 insert；跨 org batch 不可調整。
- Minimal e2e: 建 item → 入庫建批次 → 調整到新數量 → stock view 顯示更新。
- Fixtures: org + owner/editor + item + batch。

## 14. Rollout / Migration Plan (if applicable)
- DB migration steps:
  - 擴充 `transactions` 支援 type='adjustment'、quantity_after、idempotency_key。
  - 建索引：transactions(batch_id, created_at)。
- Backfill: 不需要。
- Feature flag: 不需要。
- 回滾策略：交易不可逆；回滾僅能停用 UI 入口，保留資料。

## 15. Open Questions
- Q1: adjustment 事件要存 `quantity_after`（推薦）還是只存 `quantity_delta`？（建議兩者都存：after 便於重播校正，delta 便於顯示差異。）
- Q2: MVP 是否需要「調整原因」欄位（例如遺失/過期丟棄/盤點修正）？目前先以 note 承載。


<!-- Generated from template.md for UC-05 -->

# Feature: Transactions — Inbound（入庫：直接新增庫存批次或增加數量）
- **Doc**: docs/features/transactions-inbound.md
- **Status**: Draft
- **PRD linkage**: UC-05（入庫：直接新增庫存批次或增加數量，產生交易紀錄）
- **Last updated**: 2026-02-19

## 0. Summary
本功能讓使用者在沒有採購流程的前提下，直接把物資「入庫」到系統中：可以建立新的庫存批次（batch），或對既有批次增加數量。每次入庫都必須寫入一筆不可刪除的交易/事件紀錄，確保可追溯、可重播（replay）以支援未來雲端→自架→本地搬遷。MVP 採手機優先表單，盡量降低輸入成本：到期日、存放點、標籤皆為可選。入庫數量必須是整數。

## 1. Goals
- G1: 使用者可建立庫存批次（batches），包含 item、數量、可選到期日/存放點/標籤。
- G2: 使用者可對既有批次增加數量。
- G3: 所有入庫動作都產生不可刪除的交易紀錄（append-only）。

## 2. Non-Goals
- NG1: 不做採購清單與採購→入庫轉換（屬後續功能）。
- NG2: 不做自動合併/自動判斷「是否同一批次」的複雜策略（MVP 以使用者顯式選擇：新增批次或選既有批次加數量）。
- NG3: 不做條碼/掃描或大量匯入（CSV/Sheets）。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: 入庫表單支援兩種模式：
  - 建立新批次（create batch + inbound transaction）
  - 選擇既有批次增加數量（inbound transaction）
- S2: 欄位：
  - 必填：item、quantity（整數 > 0）
  - 可選：expiry_date、storage_location_id、tag_id(s)、note
- S3: 成功後在 stock view 能看到批次數量更新；在交易列表（若有）可看到入庫紀錄。

### 3.2 Out of scope / Backlog hooks (future)
- 採購→入庫：一次入庫可建立多批次（同到期日/存放點一致）與部分入庫。
- 自動合併策略：根據（item + 到期日 + 存放點 + 包裝規格）自動找既有批次、允許覆寫/拆分。
- 批次屬性更正：修改到期日/存放點需用「轉移/更正」交易（不可直接改批次欄位）。

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP：單人等價 owner。
- 未來：
  - owner/editor: 可入庫（建立交易）
  - viewer: 只讀

### 4.2 Multi-tenant constraints
- `batches.org_id`、`transactions.org_id` 必填（並建議同時綁 `warehouse_id`）。
- RLS 覆蓋：`items`, `batches`, `transactions`（以及 `storage_locations`, `tags` 的讀取）。

## 5. UX (Mobile-first)
### 5.1 Entry points
- Stock view / Items 列表：`入庫` CTA
- 批次詳情（後續）：`增加數量`

### 5.2 Primary flow
1. 使用者在 stock view 點 `入庫`。
2. 選擇品項（item），輸入入庫數量（整數）。
3. 選擇 `建立新批次`（預設）或切換為 `增加到既有批次` 並選擇批次。
4. （可選）填到期日/存放點/標籤/備註。
5. 送出後回到 stock view，看到數量更新，並顯示「已入庫」提示。

### 5.3 Alternate / edge flows
- 空狀態：若沒有任何 Items，導向/提示先建立 Items（UC-02）。
- 驗證錯誤：quantity 必須為正整數；item 必填；日期格式錯誤。
- 權限錯誤：viewer 送出會被拒絕。
- 網路/重送：送出失敗可重試；避免雙擊造成雙交易（見 8.2）。

### 5.4 UI notes
- 表單預設值：
  - 模式預設 `建立新批次`
  - expiry_date 預設空
  - storage_location/tag 預設空
- 快速操作：數量欄位支援 +1/-1 stepper（但仍需整數）。
- 桌面版：可在右側顯示最近批次以利選擇（後續）。

## 6. Data Model Impact
### 6.1 Entities touched
- Tables: `items`, `batches`, `transactions`, `storage_locations`, `tags`
- New columns (if any):
  - `transactions.type = 'inbound'`
  - `transactions.quantity_delta`（正整數）
  - `transactions.batch_id`, `transactions.item_id`
  - `transactions.note`（可選）, `transactions.source`（如 'web'，可選）
- New tables (if any): 無（以既有交易表承載）

### 6.2 Constraints & invariants
- 不可刪除：`transactions` append-only；錯誤以後續交易修正（等價沖銷）。
- 數量規則：入庫 quantity 必須是整數且 > 0。
- referential integrity：
  - `batches.item_id` → `items.id`
  - `transactions.batch_id` → `batches.id`
  - （可選）`batches.storage_location_id` → `storage_locations.id`
  - （可選）`batches.tag_id(s)` → `tags.id`

### 6.3 RLS expectations (high level)
- 同 org：owner/editor 可 insert inbound transactions 並更新 batches 數量（或透過 DB transaction 完成）；viewer 只能 select。
- org 判定：`batches.org_id`、`transactions.org_id` 必須與使用者 membership org_id 相符。

## 7. Domain Rules
- R1: 入庫的狀態變更必須以 DB transaction 保證：
  - 同時寫入交易紀錄 + 更新（或建立）批次數量。
- R2: 建立新批次時，批次屬性（expiry/location/tag）以入庫表單為準，且可為空。
- R3: 增加既有批次時，不改變批次的 expiry/location/tag（避免把「更正/轉移」混進入庫）。
- R4: 交易不可刪除；若填錯，使用者可用後續入庫/出庫/調整修正。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `action createInboundBatch(input)`（建立新批次 + 入庫交易）
  - Request: `{ itemId, quantity, expiryDate?, storageLocationId?, tagIds?/tagId?, note? }`
  - Response: `{ batch, transaction }`
  - AuthZ: owner/editor
  - Validation: itemId 存在且屬於同 org；quantity 為正整數；expiryDate（若有）合法
  - Failure modes: `ITEM_NOT_FOUND`, `QUANTITY_INVALID`, `FORBIDDEN`

- `action addInboundToBatch(input)`（既有批次 + 入庫交易）
  - Request: `{ batchId, quantity, note? }`
  - Response: `{ batch, transaction }`
  - AuthZ: owner/editor
  - Validation: batchId 存在且屬於同 org；quantity 為正整數
  - Failure modes: `BATCH_NOT_FOUND`, `QUANTITY_INVALID`, `FORBIDDEN`

- `action listBatchesForItem(itemId)`（供 UI 選擇既有批次）
  - Response: `{ batches }`
  - AuthZ: authenticated

### 8.2 Idempotency / Concurrency
- 重複送出（避免雙擊）：
  - 建議在 `transactions` 加 `idempotency_key`（client 生成 UUID）並設 unique (org_id, idempotency_key)。
  - action 在同 key 下重送回傳同一筆結果。
- 競態：同批次同時入庫
  - 使用 `SELECT ... FOR UPDATE` 鎖 batch row 或以 atomic update（`quantity = quantity + :delta`）在 transaction 中完成。
- 交易一致性：所有寫入（transactions + batches）必須同 DB transaction。

## 9. Jobs / Notifications (if applicable)
- 不直接發送通知；入庫會影響低庫存判斷（UC-09）。

## 10. Export / Portability hooks (architecture requirement)
- 需要被匯出的表/事件：`items`, `batches`, `transactions`（以及字典：`storage_locations`, `tags`）。
- 最小可重建資訊：
  - schema_version
  - org/warehouse ids
  - items（主檔）
  - batches（含屬性）
  - transactions（含 type、batch_id、quantity_delta、created_at、note）
- replay/rebuild 假設：
  - 匯入端可先重建 items/字典，再建立 batches（或先只建 items，batches 可由交易重播重建—二擇一）。
  - 建議以交易重播為主，以驗證一致性；但需保留原始 batch_id 與 transaction ordering。
- 相容性/版本策略：
  - 交易事件型別需版本化（如 `type` + `schema_version`）。
  - 若未來新增 purchase->inbound 事件，舊資料仍可照 inbound replay。

## 11. Telemetry / Auditability
- audit 欄位：transactions.created_at/by、source（web/api）、note。
- 查詢：
  - 最近 N 筆入庫
  - 依 item/batch 查交易歷史（供追溯）

## 12. Acceptance Criteria
- AC1: Given owner/editor When 建立新批次入庫（quantity=10）Then 產生 1 筆 inbound 交易，且批次數量為 10。
- AC2: Given owner/editor And 既有批次數量為 10 When 對該批次入庫 quantity=5 Then 產生 1 筆 inbound 交易，且批次數量變為 15。
- AC3: Given viewer When 嘗試入庫 Then 被拒絕（FORBIDDEN）。
- AC4: Given quantity 非整數或 <=0 When 送出 Then 顯示驗證錯誤且不產生交易。
- AC5: Given 使用者雙擊送出 When 使用同 idempotency_key 重送 Then 系統只產生 1 筆交易。

## 13. Test Strategy (feature-level)
- Unit tests: quantity 驗證（整數、>0）、日期驗證、idempotency key 行為。
- Integration tests (DB + RLS): viewer 禁止 insert；跨 org batch/item 不可入庫。
- Minimal e2e: 建 item → 入庫建立批次 → stock view 顯示批次與數量 → 再次入庫到同批次。
- Fixtures: org + owner/editor + item +（可選）locations/tags。

## 14. Rollout / Migration Plan (if applicable)
- DB migration steps:
  - 建/更新 `transactions` 欄位（type, quantity_delta, batch_id, idempotency_key）。
  - 建 FK/索引（batch_id, item_id, created_at）。
- Backfill: 不需要。
- Feature flag: 不需要。
- 回滾策略：交易不可逆；回滾僅能停用 UI 入口，保留資料。

## 15. Open Questions
- Q1: MVP 是否需要交易列表 UI（最近交易）？PRD 未要求，但對除錯與信任感有幫助。
- Q2: batches 是否需要 `received_at`（入庫日期）欄位，或完全以交易時間推導？（建議先用交易時間。）


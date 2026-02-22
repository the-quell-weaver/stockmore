<!-- Generated from template.md for UC-02 -->

# Feature: Items（品項主檔管理：新增/編輯）
- **Doc**: docs/features/uc_02_items.md
- **Status**: Implemented
- **PRD linkage**: UC-02（管理品項：新增/編輯，含最低庫存、單位、標籤、備註）
- **Last updated**: 2026-02-19

## 0. Summary
本功能讓使用者維護「品項主檔（Items）」作為庫存與交易的基礎：包含品名、單位、最低庫存、預設標籤/類別與備註。使用者可新增與直接編輯品項主檔（此為管理資料，允許直接修改）。所有資料必須綁定 org_id 並受 RLS 保護，確保不同 org 間隔離。MVP UI 需手機優先，能快速建立常用物資，並支援基本搜尋以在大量品項中快速找到目標。

## 1. Goals
- G1: 使用者可新增 Items，作為後續入庫/出庫/盤點的選擇來源。
- G2: 使用者可編輯 Items 的管理欄位（名稱、單位、最低庫存、標籤、備註）。
- G3: Items 列表提供關鍵字搜尋，支援大量資料。

## 2. Non-Goals
- NG1: 不做「包裝規格/單項份量」欄位（屬後續功能）。
- NG2: 不做標籤作廢/禁用流程（MVP 只做新增/改名於 UC-04）。
- NG3: 不做複雜匯入（CSV/Sheets）作為 MVP。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: Items CRUD：新增、編輯、列表檢視（允許刪除？MVP 建議：提供 soft-delete 或禁止刪除；見 Domain Rules）。
- S2: 欄位：name、unit、min_stock（可為 0）、default_tag_ids（可選）、note（可選）。
- S3: Items 列表 + 搜尋（name keyword）。

### 3.2 Out of scope / Backlog hooks (future)
- 兩層聚合顯示所需的「包裝規格」與聚合設定（留 extension column/表）。
- Items 匯入/匯出（CSV/JSON）、與外部系統同步。
- 標籤作廢、進階分類、多層分類樹。

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP：單人等價 owner，擁有 read/write。
- 未來：
  - owner/editor: 可新增/編輯 Items
  - viewer: 只讀

### 4.2 Multi-tenant constraints
- `items.org_id` 必填。
- RLS 覆蓋：`items`（read/write）、（若 items 透過 tags 關聯）`tags`, `item_tags`。

## 5. UX (Mobile-first)
### 5.1 Entry points
- 底部導覽或側邊欄：`Items`
- 空狀態 CTA：`新增品項`

### 5.2 Primary flow
1. 使用者進入 Items 列表。
2. 點擊 `新增品項`。
3. 填寫品名、單位、最低庫存、標籤（可選）、備註（可選）。
4. 儲存後回到列表，並可立即用於入庫流程。

### 5.3 Alternate / edge flows
- 空狀態：顯示常見品項提示（僅 UI 提示，不自動建立）。
- 驗證錯誤：品名必填；單位必填；最低庫存不得為負。
- 大量資料：列表支援搜尋（debounced），並可分頁/無限捲動（後續）。

### 5.4 UI notes
- 表單預設值：min_stock 預設 0；標籤預設空；note 預設空。
- 快速操作：手機上將 `儲存` 固定在底部 sticky bar。
- 桌面版：可雙欄（列表 + 詳情）作為後續優化，但 MVP 先單頁即可。

## 6. Data Model Impact
### 6.1 Entities touched
- Tables: `items`, `tags`（引用，若有）
- New columns (if any): `items.min_stock`, `items.unit`, `items.note`
- New tables (if any): `item_tags`（若採多標籤）或 `items.default_tag_id`（若採單標籤；建議多標籤但 MVP 可先單一）

### 6.2 Constraints & invariants
- `items.name`：在同 org 範圍內強制 unique（case-insensitive）。實作採部分唯一索引 `(org_id, lower(name)) WHERE is_deleted = false`，已封存品項不計入唯一性約束。
- `items.min_stock >= 0`。
- referential integrity：item_tags.tag_id → tags.id。

### 6.3 RLS expectations (high level)
- 同 org 內：owner/editor 可 insert/update；viewer 只能 select。
- org 判定：items.org_id 需落在使用者 membership 的 org。

## 7. Domain Rules
- R1: Items 屬於「主檔管理資料」，允許直接更新，不必以交易/事件記錄變更。
- R2: 若某 item 已被 batches/transactions 引用，MVP 不建議硬刪除：
  - 建議策略 A：禁止刪除，只允許「封存 archived」（future hook）。
  - 或策略 B：允許 soft-delete（is_deleted）但保留歷史引用可讀。
- R3: 單位（unit）為顯示用途；不進行單位換算（MVP）。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `action createItem(input)`
  - Request: `{ name, unit, minStock, defaultTagIds?, note? }`
  - Response: `{ item }`
  - AuthZ: owner/editor
  - Validation: name 非空；unit 非空；minStock >= 0
  - Failure: `ITEM_NAME_REQUIRED`, `ITEM_UNIT_REQUIRED`, `ITEM_MIN_STOCK_INVALID`, `ITEM_NAME_CONFLICT`, `FORBIDDEN`

- `action updateItem(itemId, patch)`
  - Request: `{ name?, unit?, minStock?, defaultTagIds?, note? }`
  - Response: `{ item }`
  - AuthZ: owner/editor
  - Validation: 同上
  - Failure: `NOT_FOUND`, `FORBIDDEN`, `ITEM_NAME_CONFLICT`

- `action listItems(query?)`
  - Request: `{ q? }`
  - Response: `{ items: Item[] }`
  - AuthZ: authenticated (viewer allowed)

### 8.2 Idempotency / Concurrency
- create：以 (org_id, name) unique constraint 避免重複。
- update：採 optimistic concurrency（如 `updated_at` 或 `version`）作為後續；MVP 可先 last-write-wins。

## 9. Jobs / Notifications (if applicable)
- 不直接發送通知，但 items.min_stock 會被低庫存提醒 job 使用（UC-09）。

## 10. Export / Portability hooks (architecture requirement)
- 需要被匯出的表/事件：`items`（含 tags 關聯）。
- 最小可重建資訊：item_id、org_id、name、unit、min_stock、note、tag_ids。
- replay/rebuild 假設：items 是 master data，匯入時可先建 items，再匯入 batches/transactions。
- 相容性/版本策略：匯出包含 schema_version；若 tags 模型變動（單標籤→多標籤）需提供 migration。

## 11. Telemetry / Auditability
- 記錄：items.created_at/by、updated_at/by（若有）。
- 查詢：搜尋 items by name；列出低庫存門檻（給 UC-09 job）。
- MVP 的 API response（`Item` type）暫不回傳 `created_by` / `updated_by` 欄位；這兩個欄位僅存於 DB，供未來 audit UI 使用。

## 12. Acceptance Criteria
- AC1: Given owner/editor When 新增品項並填寫必填欄位 Then 看到品項出現在列表且可被入庫流程選用。
- AC2: Given 既有品項 When 編輯最低庫存/備註並儲存 Then 列表與詳情即時反映。
- AC3: Given viewer When 嘗試新增或編輯品項 Then 被拒絕（FORBIDDEN）。
- AC4: Given 同 org 已有同名品項 When 嘗試新增/改名為同名 Then 顯示名稱衝突錯誤。

## 13. Test Strategy (feature-level)
- Unit tests: validation（必填、min_stock 邊界、unique conflict mapping）。
- Integration tests (DB + RLS): viewer 禁止 write；跨 org 不可讀取。
- Minimal e2e: 建立 item → 編輯 → 在 inbound flow 選到該 item（跨 feature 冒煙測）。
- Fixtures: 建立 org + 兩個角色使用者（或等價）。

## 14. Rollout / Migration Plan (if applicable)
- DB migration steps: 建 items 表與 constraint；（可選）建 item_tags。
- Backfill: 不需要。
- Feature flag: 不需要。
- 回滾策略：保留 items 資料；若改模型（單標籤→多標籤）需提供 backward-compatible read。

## 15. Open Questions
- Q1: tags 模型 MVP 決議採「單一標籤」，使用 `items.default_tag_id`（nullable，UI 可先不暴露選擇器，待 UC-04 連接）。
- Q2: Items 刪除策略決議採「soft-delete」，使用 `items.is_deleted`，預設列表不顯示已封存。

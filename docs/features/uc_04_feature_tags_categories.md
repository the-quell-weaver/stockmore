<!-- Generated from template.md for UC-04 -->

# Feature: Tags & Categories（標籤字典：新增/改名）
- **Doc**: docs/features/tags-and-categories.md
- **Status**: Draft
- **PRD linkage**: UC-04（管理標籤字典：新增/改名）
- **Last updated**: 2026-02-19

## 0. Summary
本功能提供「倉庫層級」的標籤/類別字典（Tags / Categories），讓使用者能建立一份可重用的標籤清單，並在 Items 與庫存批次（batches）上套用以利辨識與（後續）篩選。MVP 僅支援新增與改名；改名需反映到既有 Items/批次/交易顯示（以 tag_id 關聯而非字串複製）。MVP 不提供作廢/禁用流程，但資料模型需預留未來「作廢且不可刪除」與「篩選預設不顯示已作廢」的擴充。

## 1. Goals
- G1: 使用者可在倉庫維護標籤字典（新增/改名）。
- G2: Tags 能被 Items（預設標籤）與批次（batch tag）引用。
- G3: 改名能立即反映在庫存列表/交易顯示（以 ID 關聯）。

## 2. Non-Goals
- NG1: 不做標籤作廢/禁用（PRD 指定為後續功能）。
- NG2: 不做多層分類樹（僅平面標籤）。
- NG3: 不做進階篩選 UI（屬 UC-08/後續總覽）。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: 標籤字典：列表、建立、改名。
- S2: 建立/改名需驗證同倉庫內名稱不重複（建議）。
- S3: Items 表單可選擇「預設標籤」（UC-02 已引用）。
- S4: 入庫表單可選擇「批次標籤」（UC-05 會用到）。

### 3.2 Out of scope / Backlog hooks (future)
- 作廢（不可刪除）：新增 `archived_at`/`is_archived`，且 UI 預設不顯示於新增選單，但歷史資料仍可顯示並加註「已作廢」。
- 進階篩選：依 tag 篩選 stock view、快到期/低庫存總覽。
- 多倉庫：tag scope 以 `warehouse_id` 隔離，未來支援切換倉庫。

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP：單人等價 owner。
- 未來：
  - owner/editor: 可新增/改名
  - viewer: 只讀（可在表單看到 tag 選項，但不能改）

### 4.2 Multi-tenant constraints
- `tags.org_id` 必填，並建議同時綁 `tags.warehouse_id`（以支援未來多倉庫）。
- RLS 覆蓋：`tags`（read/write），以及任何關聯表（如 `item_tags` / `batch_tags`）或 `items.default_tag_id(s)` / `batches.tag_id(s)` 的存取。

## 5. UX (Mobile-first)
### 5.1 Entry points
- Settings/Dictionary 區：`標籤`
- Items 表單：選擇預設標籤
- 入庫表單：選擇批次標籤

### 5.2 Primary flow
1. 使用者進入 `標籤` 列表。
2. 點擊 `新增標籤`。
3. 輸入名稱並儲存。
4. 回到列表，看到新增標籤，且在 Items/入庫表單可立即選用。

### 5.3 Alternate / edge flows
- 空狀態：提示常見標籤（如：飲水/乾糧/醫療/工具）。
- 驗證錯誤：名稱必填；名稱不可重複。
- 大量資料：提供搜尋（後續）；MVP 可先只有列表。

### 5.4 UI notes
- 表單欄位：name（必填）。
- 快速操作：手機上列表每列提供 `改名` 入口。
- 桌面版：同樣流程。

## 6. Data Model Impact
### 6.1 Entities touched
- Tables: `tags`, `items`（引用 tags）、`batches`（引用 tags）
- New columns (if any): `tags.warehouse_id`（建議）、`tags.org_id`
- New tables (if any):
  - 若採多標籤：`item_tags(item_id, tag_id)`、`batch_tags(batch_id, tag_id)`（或統一用 polymorphic join，後續再談）。
  - 若採單標籤：`items.default_tag_id`、`batches.tag_id`。

### 6.2 Constraints & invariants
- 建議 unique：`(warehouse_id, name)`（或 `(org_id, name)` 若 MVP 暫不建 warehouse_id）。
- referential integrity：items/batches 的 tag_id（或 join 表）需 FK 指向 tags.id。
- 改名不得影響既有關聯，只改顯示名稱。

### 6.3 RLS expectations (high level)
- 同 org：owner/editor 可 insert/update；viewer 只能 select。
- org 判定：row.org_id 與使用者 membership org_id 相符（且 warehouse_id 屬於該 org）。

## 7. Domain Rules
- R1: Tags 為字典資料，允許直接改名（不需交易）。
- R2: MVP 不提供刪除：避免破壞歷史批次/交易顯示；若需移除以後續「作廢」處理。
- R3: 批次與 item 的 tag 為可選（null/空集合）以降低建檔門檻。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `action createTag(input)`
  - Request: `{ name }`
  - Response: `{ tag }`
  - AuthZ: owner/editor
  - Validation: name 非空；同倉庫/同 org 不可重複
  - Failure modes: `TAG_NAME_REQUIRED`, `TAG_NAME_CONFLICT`, `FORBIDDEN`

- `action renameTag(tagId, name)`
  - Request: `{ name }`
  - Response: `{ tag }`
  - AuthZ: owner/editor
  - Validation: 同上
  - Failure modes: `NOT_FOUND`, `FORBIDDEN`, `TAG_NAME_CONFLICT`

- `action listTags()`
  - Response: `{ tags: Tag[] }`
  - AuthZ: authenticated

### 8.2 Idempotency / Concurrency
- create：以 unique constraint 避免重複。
- rename：last-write-wins；後續可加 `updated_at`/`version`。

## 9. Jobs / Notifications (if applicable)
- 不適用。

## 10. Export / Portability hooks (architecture requirement)
- 需要被匯出的表/事件：`tags`（與任何 tag 關聯表，如 `item_tags` / `batch_tags` 或 tag_id 欄位）。
- 最小可重建資訊：schema_version、org_id、warehouse_id、tag_id、name（與 archived 狀態，若未來有）。
- replay/rebuild 假設：匯入時先建 tags，再匯入 items/batches/transactions（引用 tag_id）。
- 相容性/版本策略：
  - 匯出包含 schema_version。
  - 若未來從單標籤→多標籤（或反向），匯入端需提供 migration 或 fallback（例如將第一個 tag 當預設）。

## 11. Telemetry / Auditability
- 記錄：created_at/by、updated_at/by（若有）。
- 查詢：列出某 warehouse 的 tags（供 Items/入庫表單選擇）。

## 12. Acceptance Criteria
- AC1: Given owner/editor When 新增標籤 Then 列表出現新標籤，且 Items/入庫表單可選。
- AC2: Given 既有標籤 When 改名 Then 所有引用該標籤的 Items/批次/交易顯示更新後名稱。
- AC3: Given viewer When 嘗試新增或改名 Then 被拒絕（FORBIDDEN）。
- AC4: Given 同倉庫已存在同名 When 新增/改名為同名 Then 顯示衝突錯誤。

## 13. Test Strategy (feature-level)
- Unit tests: validation（必填、unique conflict）。
- Integration tests (DB + RLS): viewer 禁止 write；跨 org 不可讀。
- Minimal e2e: 新增 tag → 在 item form 選用 → 在 inbound form 選用 → stock view 顯示 tag 名稱（跨 feature 冒煙測）。
- Fixtures: org + warehouse + tags。

## 14. Rollout / Migration Plan (if applicable)
- DB migration steps: 建 `tags` 表、unique constraint、FK（若有 join 表）。
- Backfill: 不需要。
- Feature flag: 不需要。
- 回滾策略：保留 tags；不提供刪除。

## 15. Open Questions
- Q1: MVP tags 要採「單一標籤」還是「多標籤」？（建議：資料模型預留多標籤，但 UI 可先單選。）
- Q2: tag scope 是否以 warehouse_id 為準（建議：是，以支援未來多倉庫）？


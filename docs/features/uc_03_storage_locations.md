<!-- Generated from template.md for UC-03 -->

# Feature: Storage Locations（存放點字典：新增/改名）
- **Doc**: docs/features/uc_03_storage_locations.md
- **Status**: Implemented
- **PRD linkage**: UC-03（管理存放點字典：新增/改名）
- **Last updated**: 2026-02-22

## 0. Summary
本功能提供「倉庫層級」的存放點字典（Storage Locations），讓使用者能建立一份可重用的存放點清單，並在入庫時選擇物資實際存放位置。MVP 支援新增與改名，改名需反映到既有庫存顯示（以 location_id 關聯而非字串複製）。MVP 不提供作廢/禁用流程，但資料模型需預留未來「作廢且不可刪除」的擴充。

## 1. Goals
- G1: 使用者可在倉庫維護存放點清單（新增/改名）。
- G2: 庫存批次可選擇存放點（可選欄位）。
- G3: 改名能立即反映在庫存列表/交易顯示（以 ID 關聯）。

## 2. Non-Goals
- NG1: 不做存放點作廢/禁用（PRD 指定為後續功能）。
- NG2: 不做存放點階層（如房間/櫃子/盒子多層）。
- NG3: 不做存放點轉移交易（修改批次 location_id 需用交易的設計，屬後續）。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: 存放點字典：列表、建立、改名。
- S2: 建立/改名需驗證同倉庫內名稱不重複（建議）。
- S3: 入庫表單可選擇存放點（下游 feature 使用，UC-05）。

### 3.2 Out of scope / Backlog hooks (future)
- 作廢（不可刪除）：新增 `is_archived` 或 `archived_at`；且「仍被批次引用」時不可作廢。
- 存放點轉移：以交易紀錄處理（不可直接改批次的 location_id）。
- 多倉庫：存放點以 warehouse_id 範圍隔離，未來可新增切換。

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP：單人等價 owner。
- 未來：
  - owner/editor: 可新增/改名
  - viewer: 只讀（可在入庫表單看到列表供選擇，但不能改）

### 4.2 Multi-tenant constraints
- 存放點至少需綁 `org_id`，並建議綁 `warehouse_id`（以支援未來多倉庫）。
- RLS 覆蓋：`storage_locations`（read/write）。

## 5. UX (Mobile-first)
### 5.1 Entry points
- Settings/Dictionary 區：`存放點`
- 入庫表單：存放點下拉選擇（可跳轉快速新增，後續優化）

### 5.2 Primary flow
1. 使用者進入 `存放點` 列表。
2. 點擊 `新增存放點`。
3. 輸入名稱並儲存。
4. 回到列表，看到新增的存放點。

### 5.3 Alternate / edge flows
- 空狀態：提示「新增常用存放點（如：客廳櫃子/玄關/床下）」。
- 驗證錯誤：名稱必填；名稱不可重複。
- 大量資料：提供搜尋（後續）；MVP 可先只有列表。

### 5.4 UI notes
- 表單欄位：name（必填）。
- 快速操作：手機上列表每列提供 `改名` 入口（或點擊進入詳情）。
- 桌面版：同樣流程。

## 6. Data Model Impact
### 6.1 Entities touched
- Tables: `storage_locations`, `batches`（引用 location_id）
- New columns (if any): `storage_locations.warehouse_id`（建議）、`storage_locations.org_id`
- New tables (if any): 無

### 6.2 Constraints & invariants
- 建議 unique：`(warehouse_id, name)`（或 `(org_id, name)` 若 MVP 先不建 warehouse_id）。
- referential integrity：batches.storage_location_id → storage_locations.id（可為 null）。
- 改名不得影響既有關聯，只改顯示名稱。

### 6.3 RLS expectations (high level)
- 同 org：owner/editor 可 insert/update；viewer 只能 select。
- org 判定：row.org_id 與使用者 membership org_id 相符。

## 7. Domain Rules
- R1: 存放點為字典資料，允許直接改名（不需交易）。
- R2: MVP 不提供刪除：避免破壞歷史批次顯示；若需移除以後續「作廢」處理。
- R3: 批次可不指定存放點（null）以降低建檔門檻。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `action createStorageLocation(input)`
  - Request: `{ name }`
  - Response: `{ location }`
  - AuthZ: owner/editor
  - Validation: name 非空；同倉庫/同 org 不可重複
  - Failure: `LOCATION_NAME_REQUIRED`, `LOCATION_NAME_CONFLICT`, `FORBIDDEN`

- `action renameStorageLocation(locationId, name)`
  - Request: `{ name }`
  - Response: `{ location }`
  - AuthZ: owner/editor
  - Validation: 同上
  - Failure: `NOT_FOUND`, `FORBIDDEN`, `LOCATION_NAME_CONFLICT`

- `action listStorageLocations()`
  - Response: `{ locations: StorageLocation[] }`
  - AuthZ: authenticated

### 8.2 Idempotency / Concurrency
- create：以 unique constraint 避免重複。
- rename：last-write-wins；後續可加 version。

## 9. Jobs / Notifications (if applicable)
- 不適用。

## 10. Export / Portability hooks (architecture requirement)
- 需要被匯出的表/事件：`storage_locations`。
- 最小可重建資訊：location_id、org_id、warehouse_id、name（與 archived 狀態，若未來有）。
- replay/rebuild 假設：匯入時先建 locations，再匯入 batches（使用 location_id 關聯）。
- 相容性/版本策略：若未來加入作廢欄位，匯出需包含並在舊版匯入時採預設值。

## 11. Telemetry / Auditability
- 記錄：created_at/by、updated_at/by（若有）。
- 查詢：列出某 warehouse 的所有 locations（供入庫選擇）。

## 12. Acceptance Criteria
- AC1: Given owner/editor When 新增存放點 Then 列表出現新存放點，且入庫表單可選。
- AC2: Given 既有存放點 When 改名 Then 庫存列表中所有引用該存放點的批次顯示更新後名稱。
- AC3: Given viewer When 嘗試新增或改名 Then 被拒絕（FORBIDDEN）。
- AC4: Given 同倉庫已存在同名 When 新增/改名為同名 Then 顯示衝突錯誤。

## 13. Test Strategy (feature-level)
- Unit tests: validation（必填、unique conflict）。
- Integration tests (DB + RLS): viewer 禁止 write；跨 org 不可讀。
- Minimal e2e: 本 UC 先覆蓋「新增/改名 location」冒煙；跨 UC 的 inbound/stock view 串接驗證，於 UC-05 與 UC-08 補齊。
- Fixtures: org + warehouse + locations。

## 14. Rollout / Migration Plan (if applicable)
- DB migration steps: 建 storage_locations 表、unique constraint、FK。
- Backfill: 不需要。
- Feature flag: 不需要。
- 回滾策略：保留 locations；不提供刪除。

## 15. Open Questions
- Q1: location 的 scope 是否以 warehouse_id 為準（建議：是，以支援多倉庫）？
- Q2: MVP 是否允許刪除 location？（建議：不允許；以後續作廢替代）

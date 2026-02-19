<!-- Generated from template.md for UC-08 -->

# Feature: Stock View（庫存列表：平攤批次 + 基本搜尋）
- **Doc**: docs/features/stock-view.md
- **Status**: Draft
- **PRD linkage**: UC-08（查看庫存列表：平攤顯示所有批次 + 基本搜尋）
- **Owner**: TBD
- **Last updated**: 2026-02-19

## 0. Summary
本功能提供「庫存列表（Stock View）」作為日常維護的主入口：以**批次（batch）為最小粒度**平攤顯示所有庫存，並提供基本搜尋（以品名關鍵字為主）讓使用者能快速找到目標批次後進行入庫/消耗/盤點。MVP 不做兩層聚合與複雜篩選，但資料與 UI 結構需保留擴充點，以便未來加入聚合顯示、存放點/標籤篩選、到期狀態篩選與列印輸出等能力。

## 1. Goals
- G1: 使用者可在一個列表中看見所有批次的現有數量與關鍵屬性（品項/到期日/存放點/標籤）。
- G2: 提供基本搜尋，能以品名關鍵字快速縮小結果。
- G3: 從列表能順暢進入入庫/消耗/盤點三大操作（手機優先）。

## 2. Non-Goals
- NG1: 不做兩層聚合顯示（依品名聚合、再依到期/存放點等聚合）——MVP 先平攤。
- NG2: 不做進階篩選（標籤/存放點/到期狀態/低庫存等）與排序偏好保存。
- NG3: 不做離線 Web App 完整支援（MVP 以雲端為主）。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: 批次列表：以每個 batch 一列顯示。
- S2: 每列至少顯示：item 名稱、batch 數量、到期日（可空）、存放點（可空）、標籤（可空）。
- S3: 基本搜尋：以 item 名稱 keyword 查詢（client-side debounce）。
- S4: 列表 CTA：`入庫`、`消耗`、`盤點/調整`（可放在每列操作或頁面浮動按鈕）。

### 3.2 Out of scope / Backlog hooks (future)
- 兩層聚合顯示（UI/紙本）：依品名聚合 + 依（包裝規格/到期日/存放點）次層聚合。
- 進階篩選/排序：標籤、存放點、到期狀態、低庫存、只看有到期日等。
- 列印/輸出（PDF/print-friendly）。
- 大量資料優化：無限捲動/分頁、伺服器端全文搜尋、索引優化。

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP：單人等價 owner。
- 未來：
  - owner/editor/viewer：皆可查看 stock view
  - owner/editor：可從列表進入寫入型操作（入庫/消耗/盤點）

### 4.2 Multi-tenant constraints
- stock view 讀取的 `batches/items/storage_locations/tags` 皆需綁 `org_id`（與建議的 `warehouse_id`）。
- RLS 覆蓋：`batches`, `items`, `storage_locations`, `tags`（select）。

## 5. UX (Mobile-first)
### 5.1 Entry points
- 登入後預設導向 `/stock`。
- 全域導覽：`庫存` tab。

### 5.2 Primary flow
1. 使用者進入庫存列表（預設顯示全部批次）。
2. 使用者輸入搜尋關鍵字（品名）縮小列表。
3. 在目標批次列上點選 `入庫` / `消耗` / `盤點/調整`。
4. 完成操作後返回庫存列表並看到數量更新。

### 5.3 Alternate / edge flows
- 空狀態（無批次）：顯示「尚無庫存」+ CTA：`入庫`；若連 items 都沒有，提示先建立 items（UC-02）。
- 權限：viewer 仍可查看列表，但點寫入型 CTA 時顯示「無權限」提示或隱藏 CTA。
- 大量資料：MVP 可先限制為 server-side pagination（如 50/頁）或先做簡單 limit；後續再強化。
- 錯誤狀態：資料載入失敗（網路/權限）顯示重試。

### 5.4 UI notes
- 列表列內容建議：
  - 第一行：品名 + 數量（大字）
  - 第二行：到期日 / 存放點 / 標籤（可缺省）
- 快速操作：
  - 手機單手：提供浮動 `+`（預設入庫），長按或展開選單選消耗/盤點（後續可做）。
  - 搜尋列 sticky 在頂端。
- 桌面版差異：允許更密集表格顯示，或右側顯示批次詳情（後續）。

## 6. Data Model Impact
### 6.1 Entities touched
- Tables: `batches`, `items`, `storage_locations`, `tags`
- New columns (if any): 無（MVP 讀取現有欄位）
- New tables (if any): 無

### 6.2 Constraints & invariants
- stock view 顯示的數量來源以 `batches.quantity` 為準（其值由交易更新維持一致）。
- batches 與 items / locations / tags 的關聯以 ID 為準，避免字串複製導致改名不一致。

### 6.3 RLS expectations (high level)
- 使用者只能 select 自己 org 的 rows。
- viewer 可 select；owner/editor 亦可 select。

## 7. Domain Rules
- R1: MVP 一律以 batch 為最小顯示單位，不做聚合與自動合併。
- R2: 寫入型操作（入庫/消耗/盤點）不在 stock view 直接改數量，必須走 transactions（append-only）。
- R3: 顯示欄位缺省不阻塞：到期日/存放點/標籤可空。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `action listStockBatches(input)`
  - Request: `{ q?, limit?, cursor? }`
  - Response: `{ batches: BatchWithRefs[], nextCursor? }`
  - AuthZ: authenticated (viewer allowed)
  - Validation: q 長度上限（避免濫用），limit 上限
  - Failure modes: `FORBIDDEN`, `INVALID_QUERY`

- `action getBatchSummary(batchId)`（可選，供點擊列開詳情）
  - Response: `{ batch: BatchWithRefs }`
  - AuthZ: authenticated
  - Failure: `NOT_FOUND`, `FORBIDDEN`

> 備註：寫入型 actions 由 UC-05/06/07 各自定義。

### 8.2 Idempotency / Concurrency
- stock view 讀取為純查詢，不需 idempotency。
- 分頁 cursor 建議使用 `created_at/id` 或 `updated_at/id` 組合，避免資料變動造成跳頁（後續優化）。

## 9. Jobs / Notifications (if applicable)
- 不適用（但可在列表後續加上「快到期/低庫存」視覺提示，屬 backlog）。

## 10. Export / Portability hooks (architecture requirement)
- 需要被匯出的表/事件：`batches`（或由 `transactions` 重播重建）、以及其引用字典（items/locations/tags）。
- 最小可重建資訊：batch_id、item_id、quantity、expiry_date、storage_location_id、tag_ids。
- replay/rebuild 假設：
  - 若以交易重播為主，stock view 只要能查到重播後的 batches；
  - 若匯出包含 batches 快照，需能校驗快照與交易重播結果一致（後續）。
- 相容性/版本策略：匯出包含 schema_version；欄位新增需向後相容。

## 11. Telemetry / Auditability
- 建議記錄：stock view 查詢不必記錄逐次，但可在應用層做基本效能指標（p95 latency）。
- 查詢：
  - 依 org/warehouse 取 batches（含 item join）
  - 依 q 搜尋（item name ILIKE）

## 12. Acceptance Criteria
- AC1: Given 已有批次 When 進入 stock view Then 看到每個批次一列，顯示品名與數量。
- AC2: Given 批次含到期日/存放點/標籤 When 顯示列表 Then 這些欄位正確顯示；若為空則不顯示或顯示「—」。
- AC3: Given 輸入搜尋關鍵字 When 列表更新 Then 只顯示品名符合的批次。
- AC4: Given viewer When 進入 stock view Then 可正常查看；但無法執行入庫/消耗/盤點寫入操作。
- AC5: Given 跨 org 使用者 When 嘗試查詢其他 org 的批次 Then 被 RLS 拒絕。

## 13. Test Strategy (feature-level)
- Unit tests: 搜尋 query 解析與限制（q length, limit clamp）。
- Integration tests (DB + RLS): 跨 org select 不可；viewer select 可。
- Minimal e2e: 建 item → 入庫建批次 → stock view 顯示 → 搜尋找到該批次。
- Fixtures: org + owner/editor/viewer + items + batches。

## 14. Rollout / Migration Plan (if applicable)
- DB migration steps: 無（MVP 讀取現有表）。
- Backfill: 不需要。
- Feature flag: 不需要。
- 回滾策略：若列表負載過高可先降級為 limit/分頁；不影響資料。

## 15. Open Questions
- Q1: MVP 是否要做「過期/快到期」視覺提示（badge）？PRD 未要求，可能與 UC-09 搭配提升體驗。
- Q2: 搜尋範圍是否只限 item.name？是否需要同時支援 tag/location（後續）。


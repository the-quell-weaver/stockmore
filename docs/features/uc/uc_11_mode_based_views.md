<!-- Generated from template.md for UC-11 -->

# Feature: 多模式庫存視圖 + 採買規劃（Mode-Based Stock Views & Purchase Planning）
- **Doc**: docs/features/uc/uc_11_mode_based_views.md
- **Status**: Draft
- **PRD linkage**: UC-11
- **Last updated**: 2026-02-27

## 0. Summary

目前 `/stock` 只有單一批次平攤視圖，無法支援「規劃採買」和「盤點入庫」等不同意圖的操作情境。本功能透過 query param（`?mode=`）將 `/stock` 分成三種模式，各自針對不同使用情境最佳化顯示內容與可用動作：

- **採買規劃（plan）**：顯示有設定目標數量的品項，呈現現有庫存、缺額與完成度，協助使用者規劃採買。
- **消耗（consume）**：現有批次平攤視圖，方便快速選取批次進行消耗。
- **入庫盤點（restock）**：顯示所有品項與其批次（含無批次品項），支援逐批次盤點與入庫。

同時廢棄 `/stock/items` 路由（與 restock 模式功能重疊），並移除 `min_stock` 欄位的規格與 UI 支援。

## 1. Goals
- G1: 使用者可透過 `?mode=` 切換三種庫存操作情境。
- G2: 採買規劃模式提供品項層級聚合視圖（目標量 / 現有庫存 / 缺額 / 完成度）。
- G3: 入庫盤點模式顯示所有品項（含無批次），方便完整盤點。
- G4: 廢棄 `/stock/items` 路由，減少功能重疊。

## 2. Non-Goals
- NG1: 不支援多個採買清單（單一清單，即「有設定目標的品項」）。
- NG2: 不新增採買備註欄位（共用既有 `note`）。
- NG3: 不實作批次層級的目標量設定（`target_quantity` 為品項層級）。
- NG4: 不實作進階篩選（標籤、到期狀態等），維持現有搜尋功能。

## 3. Scope

### 3.1 MVP scope (must-have)
- S1: `/stock?mode=plan` — 採買規劃模式（品項層級，聚合庫存，可展開批次）。
- S2: `/stock?mode=consume` — 消耗模式（批次層級，現有行為，為無 param 時的預設）。
- S3: `/stock?mode=restock` — 入庫盤點模式（批次層級，所有品項 LEFT JOIN batches，含無批次空白列）。
- S4: `items.target_quantity`（`numeric`, nullable）新欄位：可在 plan 模式設定與編輯。
- S5: plan 模式有「過期品項切換」，控制現有庫存是否計入已過期批次（預設：不計入）。
- S6: plan 模式排序：未達標（`current_stock < target_quantity`）靠前，已達標靠後。
- S7: `/stock/items` 保留檔案但移除導覽連結，code 與 doc 標記 `@deprecated`。
- S8: `min_stock` 從規格與 UI 移除（DB 欄位暫留，未來 cleanup migration 處理）。

### 3.2 Out of scope / Backlog hooks (future)
- 多份採買清單（目前單一 = 有設定 target_quantity 的品項）。
- 採買備註獨立欄位（`buy_note`）；目前共用 `note`。
- Plan 模式的批次展開 UI（先做品項層級，展開功能 backlog）。
- Cursor-based pagination（已在 UC-08 列為 future work）。
- 進階篩選（到期狀態、標籤、存放點）。

## 4. Users & Permissions

### 4.1 Personas / Roles
- MVP 單人等價 owner。
- 未來 RBAC：owner/editor 可設定 `target_quantity`；viewer 僅可讀所有模式。

### 4.2 Multi-tenant constraints
- 所有查詢必須綁 `org_id`（從 session 推導，不信任 client 傳入）。
- RLS 覆蓋 `items`、`batches`（已有）；`target_quantity` 為 `items` 欄位，不需新增 RLS 規則。

## 5. UX (Mobile-first)

### 5.1 Entry points
- `/stock` — 預設進入 consume 模式。
- 頁面頂部有三個模式切換 Tab：採買規劃 / 消耗 / 入庫盤點。
- 切換 Tab = 更新 `?mode=` query param，頁面不整個重載。

### 5.2 Primary flow — 採買規劃（plan）
1. 使用者切換到「採買規劃」Tab。
2. 系統顯示有設定 `target_quantity` 的品項清單，每列呈現：品項名稱、單位、目標量、現有庫存（預設不含過期）、缺額、完成度%。
3. 使用者點擊切換按鈕「含過期」，現有庫存與缺額即時更新。
4. 使用者點擊某品項的「入庫」，開啟現有入庫 modal（UC-05），入庫後清單自動更新。
5. 已達標品項（缺額 ≤ 0）排至清單末尾。

### 5.3 Primary flow — 入庫盤點（restock）
1. 使用者切換到「入庫盤點」Tab。
2. 系統顯示所有品項：有批次的品項展開為批次列，無批次品項顯示為空白列。
3. 有批次列：點擊「盤點」開啟 adjustment modal（UC-07）；點擊「入庫」開啟入庫 modal（UC-05）。
4. 無批次列：只有「入庫」按鈕。

### 5.4 Alternate / edge flows
- **空狀態（plan 模式，無任何品項設定 target_quantity）**：顯示引導訊息，說明可在品項編輯時設定目標量。
- **空狀態（restock 模式，完全無品項）**：顯示引導訊息建議先建立品項。
- **target_quantity 為 null 的品項**：不出現在 plan 模式；出現在 restock 模式。

### 5.5 UI notes
- 模式 Tab 固定在頁面頂部（sticky），不隨列表捲動消失。
- Plan 模式「含/不含過期」切換按鈕：Toggle button，狀態清晰可辨。
- 完成度以百分比 + 視覺進度條（可選）呈現。

## 6. Data Model Impact

### 6.1 Entities touched
- Tables: `items`（新增欄位）、`batches`（新增 LEFT JOIN 查詢）
- New columns:
  - `items.target_quantity numeric` — 採購目標數量，nullable（NULL = 不在採買規劃中）
- Deprecated (spec & UI only, column stays):
  - `items.min_stock` — 從規格移除，UI 不再讀寫；DB 欄位暫留

### 6.2 Constraints & invariants
- `target_quantity` 若設定則必須 > 0（validation layer 強制）。
- `target_quantity` 為品項層級，與 warehouse 無關（MVP 單 warehouse）。
- 聚合現有庫存計算：`SUM(batches.quantity) WHERE item_id = ? [AND expiry_date > now() OR expiry_date IS NULL]`。

### 6.3 RLS expectations (high level)
- `items` 已有 RLS（org_id）；新欄位繼承相同政策。
- 不需新增 RLS 規則。

## 7. Domain Rules
- R1: `target_quantity IS NULL` = 品項不在採買規劃清單中；設為 NULL 等同移除。
- R2: 缺額（deficit）= `target_quantity - current_stock`；current_stock 依「含/不含過期」toggle 計算。
- R3: 完成度 = `min(current_stock / target_quantity * 100, 100)`%；current_stock >= target_quantity 時視為達標。
- R4: Plan 模式預設不計入已過期批次（`expiry_date < today`）的數量。
- R5: `/stock/items` 路由檔案保留但導覽連結移除；任何新功能不得依賴此路由。
- R6: `min_stock` 欄位不得出現在任何新增或修改的 UI、server action、service 程式碼中。

## 8. API / Server Actions

### 8.1 Actions

**現有（繼續服務 consume 模式）**
- `listStockBatches(input)` — 無變動

**新增**

`listItemsForPlanMode(input)`
- Request: `{ q?, excludeExpired?: boolean (default: true) }`
- Response: `PlanModeItem[]` — `{ itemId, name, unit, targetQuantity, currentStock, deficit, completionPct, note }`
- AuthZ: org membership
- Validation: `excludeExpired` boolean
- Failure modes: `FORBIDDEN`, `INVALID_QUERY`

`listItemsWithBatches(input)`
- Request: `{ q? }`
- Response: `ItemWithBatches[]` — `{ itemId, name, unit, note, batches: BatchWithRefs[] }` (batches 可為空陣列)
- AuthZ: org membership
- Failure modes: `FORBIDDEN`, `INVALID_QUERY`

`updateItemTargetQuantity(input)`
- Request: `{ itemId, targetQuantity: number | null }`
- Response: `{ ok: true }` / `{ ok: false, error: AppErrorCode }`
- AuthZ: org membership（owner/editor）
- Validation: `targetQuantity > 0` 或 `null`
- Failure modes: `FORBIDDEN`, `ITEM_NOT_FOUND`, `VALIDATION_ERROR`

### 8.2 Idempotency / Concurrency
- 讀取操作無需 idempotency key。
- `updateItemTargetQuantity` 為簡單 UPDATE，不涉及競態條件（欄位無累加邏輯）。

## 9. Export / Portability hooks

- `target_quantity` 為 `items` 欄位，隨 items 匯出。
- Replay 時 `target_quantity` 直接還原，無需特殊處理。

## 10. Telemetry / Auditability
- `target_quantity` 變更目前不需 audit trail（非交易型資料）。
- 未來若需要可加 `items_history` 表或 `updated_at` + `updated_by`。

## 11. Acceptance Criteria

**Plan 模式**
- AC1: 只有設定 `target_quantity` 的品項出現在 plan 模式列表中。
- AC2: 現有庫存預設不計入過期批次；切換「含過期」後數字即時更新。
- AC3: 缺額 = target_quantity - current_stock（最小為 0）；完成度 = current_stock / target_quantity * 100%（最大 100%）。
- AC4: 已達標品項（完成度 100%）排列在未達標品項之後。
- AC5: 點擊入庫開啟 UC-05 入庫流程；入庫完成後 plan 模式資料自動更新。

**Consume 模式**
- AC6: 無 `?mode=` param 或 `?mode=consume` 時，顯示現有批次平攤視圖（UC-08 行為不變）。

**Restock 模式**
- AC7: 所有品項皆出現，有批次者展開為批次列，無批次者顯示空白列。
- AC8: 有批次列可觸發盤點（UC-07）與入庫（UC-05）。
- AC9: 無批次列只可觸發入庫（UC-05）。

**廢棄**
- AC10: `/stock/items` 不出現在任何導覽連結中；直接輸入 URL 仍可訪問（頁面保留）。
- AC11: `min_stock` 不出現在任何 UI 欄位或 server action input 中。

**安全**
- AC12: 不同 org 的品項與批次資料完全隔離，嘗試跨 org 讀取返回 `FORBIDDEN`。

## 12. Test Strategy

- **Unit tests**: `listItemsForPlanMode` 聚合計算（含/不含過期）、排序邏輯、`updateItemTargetQuantity` validation。
- **Integration tests (DB + RLS)**: LEFT JOIN 查詢完整性（無批次品項出現）、RLS 跨 org 隔離、`target_quantity` CRUD。
- **Minimal e2e**: plan 模式顯示品項 + 切換過期 toggle + 從清單觸發入庫；restock 模式顯示無批次品項 + 觸發入庫。
- **Test data**: 需要「有 target_quantity 品項」、「無 target_quantity 品項」、「無批次品項」、「有過期批次品項」的 fixture。

## 13. Rollout / Migration Plan

- DB migration: `ALTER TABLE items ADD COLUMN target_quantity numeric;`（無 backfill 需求，nullable）
- `min_stock` cleanup migration: 列為獨立 future PR，本次不做。
- `/stock/items` 廢棄: 移除導覽 + 加 `@deprecated` 標記，不刪除檔案。
- 無 feature flag 需求（全新模式，不影響現有 consume 預設行為）。

## 14. Open Questions
- Q1: Plan 模式的品項展開批次 UI（桌面版可考慮 accordion）—— backlog，未定樣式。
- Q2: `target_quantity` 是否需要 `updated_at` / `updated_by` audit trail —— 目前不做，未來可補。

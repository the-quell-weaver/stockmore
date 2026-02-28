<!-- Generated from template.md for UC-12 -->

# Feature: 紙本庫存清單列印（Print Inventory to PDF）
- **Doc**: docs/features/uc/uc_12_print_inventory.md
- **Status**: Draft
- **PRD linkage**: UC-12
- **Last updated**: 2026-02-27

## 0. Summary

當實際急難情況發生時，使用者可能無法連上本服務。本功能提供將當前庫存清單輸出為可列印版面（PDF）的能力，使用者可事先列印備用。

列印版面與網頁視圖不同：以品項為群組標頭，各批次分行列出，每行以方格圖示視覺化數量（1 格 = 1 單位，每 5 格一組），方便使用者在紙本上劃記耗用，並直觀判斷剩餘數量。

實作採用 CSS `@media print` + `window.print()`，不需後端 PDF 生成。

## 1. Goals
- G1: 使用者可從 `/stock` 觸發列印，取得格式化的庫存紙本（或 PDF 存檔）。
- G2: 列印版面以品項分組，批次分行，清楚易讀。
- G3: 數量以方格圖示呈現，方便紙本劃記。

## 2. Non-Goals
- NG1: 不需後端生成 PDF（瀏覽器列印 / 存成 PDF 即可）。
- NG2: 不列印採買規劃欄位（目標量、缺額等）。
- NG3: 不支援自訂列印欄位選擇。
- NG4: 混合縮放格子（超過閾值時 N 格 = N 單位）列為 future work，本次不實作。

## 3. Scope

### 3.1 MVP scope (must-have)
- S1: `/stock` 頁面新增「列印」按鈕，點擊觸發 `window.print()`。
- S2: CSS `@media print` 定義列印專用版面，隱藏導覽、模式 Tab、操作按鈕等 UI 元素。
- S3: 列印內容：庫存清單（consume 模式資料），以品項名稱為群組標頭，批次各自一行。
- S4: 每批次行顯示：品項名稱（群組已顯示時可縮排）、批次數量（方格圖示）、到期日（可空）、存放點（可空）、標籤（可空）。
- S5: 數量方格：固定比例 1 格 = 1 單位，每 5 格為一組（視覺分隔），方格以空格形式呈現（供劃記）。
- S6: A4 portrait 為目標紙張尺寸。

### 3.2 Out of scope / Backlog hooks (future)
- **混合縮放**：數量超過閾值（例如 50）時自動縮放，1 格 = N 單位；不同造型格子代表不同單位數（例如 □ = 1, ■ = 5, ◆ = 10）。Extension point：將方格渲染邏輯抽成獨立函數，未來替換縮放演算法不影響其他部分。
- 自訂欄位選擇、自訂紙張大小。
- 列印時包含採買規劃資訊。

## 4. Users & Permissions

### 4.1 Personas / Roles
- 所有登入使用者（owner/editor/viewer）均可觸發列印。
- 列印使用已載入頁面的資料，不需額外 API 呼叫。

### 4.2 Multi-tenant constraints
- 列印資料來自當前已認證 session 的 org，RLS 已由資料載入時確保。
- 列印本身無寫入操作。

## 5. UX (Mobile-first)

### 5.1 Entry points
- `/stock` 頁面（任何模式皆可觸發，但列印內容固定為庫存清單）。
- 列印按鈕建議放置於頁面頂部右側（與模式 Tab 同行或相鄰）。

### 5.2 Primary flow
1. 使用者在 `/stock` 點擊「列印」按鈕。
2. 瀏覽器開啟列印對話框（或直接進入列印預覽）。
3. 使用者選擇列印機或「儲存為 PDF」。
4. 輸出包含品項群組 + 批次行 + 方格數量圖示的清單。

### 5.3 Alternate / edge flows
- **無庫存（無批次）**：列印頁面顯示空白清單提示（例如「目前無庫存記錄」）。
- **數量極大**：固定 1 格 = 1 單位，格子跨行繼續；超過合理範圍時頁面自動分頁。

### 5.4 UI notes
- `@media print` 隱藏：導覽列、模式 Tab、搜尋欄、所有操作按鈕、列印按鈕本身。
- 方格使用等寬字型或 SVG/CSS 繪製，確保列印時對齊。
- 每 5 格加視覺分隔（空白或細線），方便計數。
- 頁首可加：組織名稱、列印日期。
- 桌面版：`window.print()` 開啟系統列印對話框，行為與手機一致。

## 6. Data Model Impact

### 6.1 Entities touched
- 無新增欄位或表格。
- 使用現有 `listStockBatches` 資料（batches + item name + location + tag）。

### 6.2 Constraints & invariants
- 列印資料為當下快照，不儲存。

### 6.3 RLS expectations
- 繼承現有批次 RLS，無新增需求。

## 7. Domain Rules
- R1: 列印內容為「批次層級」庫存清單，不做聚合。
- R2: 同品項的批次排列在一起（以品項名稱為群組）。
- R3: 方格數量圖示固定比例：1 格 = 1 單位，每 5 格一組。
- R4: 方格只顯示正整數個格子（`Math.floor(quantity)` 向下取整）。

## 8. API / Server Actions
- 無新增 API。列印使用頁面已載入的批次資料，由 `listStockBatches` 提供（UC-08 現有 action）。

## 9. Export / Portability hooks
- 列印為用戶端操作，資料不需持久化或匯出。

## 10. Telemetry / Auditability
- 無需記錄列印事件（用戶端行為，無寫入）。

## 11. Acceptance Criteria
- AC1: 點擊「列印」按鈕觸發瀏覽器列印對話框。
- AC2: 列印版面不顯示導覽、Tab、搜尋欄、操作按鈕。
- AC3: 品項以群組呈現，批次各自一行列於品項標頭下。
- AC4: 每批次行包含數量方格圖示（1 格 = 1 單位，5 格一組）、到期日（有則顯示）、存放點（有則顯示）、標籤（有則顯示）。
- AC5: 無庫存時列印頁面顯示空白提示而非空白頁。
- AC6: 在 Chrome / Safari 的「儲存為 PDF」功能下版面正常（A4 portrait）。

## 12. Test Strategy
- **Unit tests**: 方格渲染函數（`renderQuantityBoxes(n)`）——各種數量邊界值（0, 1, 5, 6, 10, 50）。
- **Integration tests**: 無（純前端渲染）。
- **Visual / snapshot test**: 列印版面 HTML snapshot，確保版面結構穩定。
- **Minimal e2e**: 點擊列印按鈕，確認 `window.print` 被呼叫（mock）。

## 13. Rollout / Migration Plan
- 無 DB migration。
- 無 feature flag 需求（純前端新增）。

## 14. Open Questions
- Q1: 列印按鈕是否應在所有模式下都顯示，或只在 consume 模式顯示？（目前設計：所有模式皆顯示，列印內容固定為庫存清單）
- Q2: 頁首是否需要顯示 warehouse 名稱？（MVP 單 warehouse，目前先顯示 org 名稱）

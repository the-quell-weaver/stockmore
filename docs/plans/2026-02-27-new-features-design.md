# Design: Mode-Based Views, Print, and Demo Mode
- **Date**: 2026-02-27
- **Status**: Approved
- **Features**: UC-11 (多模式庫存視圖 + 採買規劃), UC-12 (紙本庫存清單), UC-13 (展示模式)

## Context

本次 brainstorming 涵蓋三個新功能，設計決策與取捨記錄如下。

---

## UC-11：多模式庫存視圖 + 採買規劃

### 核心決策

**購買清單 = 品項目錄的另一種視角（Option A）**
不建立獨立實體。新增品項到待買清單 = 直接建立品項（帶 `target_quantity`）。
理由：資料一致、不需要新表格、入庫流程完全複用現有邏輯。

**mode 由 query param 控制**
`/stock?mode=plan|consume|restock`，支援 deep-link。
無 param 時預設 `consume`（維持現有行為）。

**`/stock/items` 廢棄**
與 `restock` 模式功能重疊。保留檔案，移除導覽連結，code 與 doc 標記 `@deprecated`。
未來用獨立 migration PR 刪除。

**`min_stock` 廢棄**
需求已過時。從規格與 UI 移除。DB 欄位暫留（避免 migration risk），未來 cleanup migration 處理。

**`note` 欄位共用**
採買備註與一般備註共用 `items.note`，不額外新增欄位。

### 三種模式對照

| | 採買規劃 `plan` | 消耗 `consume` | 入庫盤點 `restock` |
|---|---|---|---|
| 顯示範圍 | 有設定 `target_quantity` 的品項 | 有庫存的批次（qty > 0） | 所有品項（LEFT JOIN batches） |
| 視圖層級 | 品項層級（可展開批次） | 批次層級（flat list） | 批次層級 |
| 額外資訊 | 目標量 / 現有庫存 / 缺額 / 完成度 | 批次詳情 | — |
| 過期切換 | ✅（影響庫存總量與缺額） | — | — |
| 排序 | 未達標靠前，已達標靠後 | 現有排序 | 現有排序 |
| 主要動作 | 入庫（UC-05） | 消耗（UC-06） | 盤點 adjustment（UC-07） |
| 次要動作 | — | — | 入庫（UC-05） |
| 無批次品項 | 不顯示（無 target_quantity） | 不顯示 | 顯示為空白列 |

### 新增 DB 欄位

```sql
ALTER TABLE items ADD COLUMN target_quantity numeric;
```

### 新增 Service Methods

- `listItemsForPlanMode(supabase, input)` — 回傳有 target_quantity 的品項 + 各品項聚合庫存（可選排除過期）
- `listItemsWithBatches(supabase, input)` — 回傳所有品項 LEFT JOIN batches（restock 模式用）

現有 `listStockBatches` 繼續服務 consume 模式。

---

## UC-12：紙本庫存清單列印

### 核心決策

**CSS @media print + window.print()**
不需要後端 PDF 生成。瀏覽器列印至 PDF 就已足夠（使用者自行列印或存成 PDF）。

**數量視覺化：固定比例 1 格 = 1 單位，每 5 格一組**
MVP 採固定比例。超過一定數量時格子會跨行繼續，空間換直觀性。

**Future work：混合縮放**
超過閾值（例如 50）時自動縮放，不同造型格子代表不同單位數（例如 □ = 1, ■ = 5, ◆ = 10）。
本次不實作，記錄為 future work。

---

## UC-13：展示模式

### 核心決策

**Supabase Anonymous Sign-in**
最符合「零 demo 判斷、完全相同 code path」的需求。
流程：`/demo` → `signInAnonymously()` → bootstrap → `seedDemoData()` → `/stock`
App 程式碼完全不知道這是 demo 使用者，無任何 `if (isDemo)` 判斷。

**Seed fixture 管理**
- `src/lib/demo/seed-fixture.ts`：TypeScript 靜態資料，型別安全
- `scripts/export-demo-seed.ts`：dev-only 匯出腳本，從 local/staging 指定 org 匯出成 fixture 格式
- 更新流程：修改 fixture → commit → deploy（preview + production 皆適用）

**匿名用戶清理**
Supabase 原生支援匿名用戶自動過期（建議設 72 小時），無需自寫清理邏輯。

### Future works（純本地 / Self-host）

Service layer isolation 已就位（所有 Supabase 呼叫只在 service layer）。
往後純本地版本只需在 service layer 換 localStorage mock，不需動 UI 或 server actions。
具體時機：當 demo 的 Supabase resource cost 開始顯著，或需要 offline 展示時再 refactor。

---

## 測試影響（跨功能）

- UC-08 tests：stock view 行為變動（mode 概念加入），需更新
- `/stock/items` route tests：廢棄後需調整（移除或標記）
- UC-11 新增：plan mode 聚合計算單元測試、restock LEFT JOIN 查詢整合測試
- UC-12：print layout 無 DB 操作，可用 snapshot/visual test
- UC-13：`/demo` route 整合測試（anonymous flow + seed）、anonymous user RLS 行為

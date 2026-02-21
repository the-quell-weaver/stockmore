# Agent Entry: PrepStock（防災物資庫存管理 SaaS）

> 這份文件是給 **agentic AI（Codex / Vercel Agent / 其他自動化代理）** 的進入點。
> 目標是讓新進代理能在最短時間理解專案背景、約束、文件分佈與協作流程，並能「小步快跑」地完成單一功能改動。

## 1. 專案背景（Context）

PrepStock（暫名 Stockmore）是一個「防災物資庫存管理」的手機優先 SaaS。

核心問題：
- 防災物資需要長期維護（採買、存放、消耗、盤點、到期、補貨），但一般人缺乏簡單可信的工具。
- 災害情境可能缺電/斷網，因此系統設計需保留 **資料可攜 / 可搬遷** 的路徑（雲端 → 自架 → 本地）。

技術選型（MVP）：
- Next.js（App Router）+ TypeScript
- Supabase（Postgres + Auth）
- Vercel 部署

**最重要的系統設計準則**
- 多租戶：所有資料綁 `org_id`（建議同時綁 `warehouse_id` 以支援未來多倉庫）。
- Supabase RLS 必做：每張表都要有 RLS，且任何 server action / API 不能信任 client 傳入的 `org_id`。
- 交易不可任意刪除：以 append-only 的交易/事件保留歷史；修正用後續交易（等價沖銷）。

## 2. MVP 功能範圍（你做改動時要守的邊界）

MVP 必含：
- Items（品項）管理：分類/單位/最低庫存/備註
- Transactions：入庫 / 消耗 / 盤點調整
- Stock View：庫存列表（平攤 batch）+ 基本搜尋
- 到期/低庫存 Email 提醒（排程 job + 去重）

MVP 明確不做（除非另開需求）：
- Google Drive / Sheets 深度整合
- 複雜 ERP（採購單、供應商、會計等）
- 完整離線 Web App（但要保留未來自架/本地的路徑）

## 3. 協作模式（Agents 該怎麼分工）

本專案固定採用兩種代理合作：

### 3.1 Codex（程式碼主責）
Codex 負責：
- 依 docs/ 的規格實作功能
- 寫/改測試，確保 CI 綠燈
- 產出小 PR（每 PR 一件事）

### 3.2 Vercel Agent（部署/Preview 檢查主責）
Vercel Agent 負責：
- 檢查 Preview/Prod 行為
- 檢查 env vars / Auth callback / Routing
- 看 logs 與部署問題排查

**規則：**
- 需求與設計文件由 ChatGPT（本對話）維護；程式碼由 Codex 落地。
- 每次改動都要能回滾：Feature flag / UI 入口下線 / Migration 可回復（或明確「資料不可逆」）。

## 4. 文件地圖（Where to look first）

> 若你只能看 3 份文件：先看 PRD，再看 DATA_MODEL，再看目標 feature spec。

- `docs/PRD.md`
  - 全局概覽：目標、MVP 範圍、核心用例、全局驗收。
- `docs/features/*.md`
  - 每個用例一份 feature spec（MVP 的真實需求來源）。
- `docs/DATA_MODEL.md`
  - 表結構、索引、約束、RLS 概述。
- `docs/SECURITY.md`
  - 租戶隔離、角色權限、RLS 需求與威脅模型。
- `docs/API_SPEC.md`
  - Server actions / route handlers 的 request/response、錯誤碼、權限。
- `docs/UX_FLOW.md`
  - 頁面資訊架構、手機優先流程。
- `docs/JOBS_AND_NOTIFICATIONS.md`
  - 提醒規則、排程、去重、重試策略。
- `docs/TEST_STRATEGY.md`
  - 單元/整合/最小 e2e 覆蓋。
- `docs/TESTING_GUIDE.md`
  - 本機測試執行流程（unit/integration/e2e）與常見問題。
- `docs/RELEASE_CHECKLIST.md`
  - 上線檢查（env、migrations、RLS、jobs、回滾）。

## 5. Repo 結構建議（Agents 實作時的預設）

> 依 Next.js App Router 的常見習慣；若現況不同，以 repo 實際結構為準。

- `src/app/`：路由與頁面（server component 為主；需要互動才用 client component）
- `src/components/`：可重用 UI 元件
- `src/lib/`：supabase client、auth helpers、domain helpers、logger
- `src/db/`：SQL schema（若採 migrations）、query helpers
- `docs/`：規格文件（本專案的單一真相來源）
- `tests/`：測試（unit/integration/e2e）

## 6. 開發與驗收的最小迴圈（Agent Workflow）

每個 PR 只做一件事，遵循：
1. **讀 spec**：對應的 `docs/features/<...>.md`（與 PRD）
2. **寫測試（優先）**：
   - 能寫就先寫（尤其是 domain rules、RLS、jobs 去重）
   - 太小的改動可以直接實作，但至少要跑既有測試
3. **最小實作**：保持簡單、可讀、可回滾
4. **整合/重構**：在通過測試後再做小幅重構
5. **驗收**：對照 feature 的 Acceptance Criteria

## 7. 安全與資料隔離（不得違反）

- 每張表：`org_id` 必備（MVP 可加 `warehouse_id`）
- 所有表都要 RLS（select/insert/update/delete）
- server actions / route handlers：
  - 從 session / membership 推導 org/warehouse context
  - 不信任 client 傳入 org_id

## 8. Jobs / Cron（提醒通知）

- 排程 job 使用 service role（繞過 RLS），但**查詢必須以 org/warehouse 範圍限定**。
- 去重必須由 DB unique constraint 保證（例如 dedupe_key）。

## 9. 變更時的輸出要求（給 Agents 的共通交付）

每次交付（PR / patch）至少包含：
- 變更說明：做了什麼、為什麼、風險
- 測試：新增/更新哪些測試、如何本地跑
- 回滾：如何停用或復原
- 若有 DB 變更：migration + RLS policy 變更 + 驗證步驟

## 10. 快速連結（常用規格）

- UC-01 Auth & Onboarding：docs/features/uc_01_auth_onboarding.md
- UC-02 Items：docs/features/uc_02_items.md
- UC-03 Storage Locations：docs/features/uc_03_storage_locations.md
- UC-04 Tags & Categories：docs/features/uc_04_feature_tags_categories.md
- UC-05 Transactions - Inbound：docs/features/uc_05_feature_transactions_inbound.md
- UC-06 Transactions - Consumption：docs/features/uc_06_feature_transactions_consumption.md
- UC-07 Transactions - Adjustment：docs/features/uc_07_transactions_adjustment.md
- UC-08 Stock View：docs/features/uc_08_stock_view.md
- UC-09 Notifications：docs/features/uc_09_notifications.md

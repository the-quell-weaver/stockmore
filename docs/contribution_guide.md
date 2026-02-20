# Contribution Guide（開發文化與規則）

> 本專案目標是「低頻低量、手機優先、推廣阻力最低」的防災物資庫存管理 SaaS。
> 我們重視可維護性與可擴充性，但**避免過度設計**；同時也避免只貼著規格寫死，應預留合理的 extension points。

## 1. 核心價值觀

1. **小步快跑**：每次只做一個小功能或一個小改善，頻繁整合、頻繁回歸。
2. **簡單優先**：先用最少的結構完成需求，再在測試護城河下逐步重構。
3. **可搬遷/可追溯**：交易 append-only、RLS 完整、資料能匯出/重播，為雲端→自架→本地保留路徑。
4. **手機優先**：常用操作要一手可完成、輸入負擔低。

## 2. 我們怎麼寫功能（TDD + 重構節奏）

我們偏好 TDD，但採「務實」原則：

### 2.1 建議流程（一般情況）

1. **讀 spec**：對應的 `docs/features/<...>.md` 與相關 domain rules。
2. **先寫測試**：

   * domain rules（例如不可負庫存、去重 key、idempotency）
   * RLS 行為（跨 org 必拒絕）
   * job 行為（去重、重試）
3. **重構既有 code base（若需要）**：

   * 先讓程式碼更易加新功能（抽小函式、改善命名、去除重複）
   * 重構後必須全測試綠燈
4. **加上新功能最小實作**：完成 acceptance criteria。
5. **再小幅重構**：讓邏輯更清晰、測試更穩。

### 2.2 何時可以不先寫測試？

如果功能極小、風險低（例如文案、純 UI 排版、明顯不影響 domain 的小修），可以直接實作。
但仍需：

* 跑完現有測試
* 避免引入新耦合或隱性規則

### 2.3 Living Docs：從實作回填、再收斂

本專案採用「規格拆小（features/UC）+ 文件最小化」策略。

* `docs/features/uc_0X_*.md` 是功能需求與驗收的**主來源**。
* 但在真正落地時，某些細節（schema/RLS/API/UX/錯誤碼）很難在一開始就完美定稿。

因此我們採用 **Living Docs** 工作法：

1. **先讓功能可交付**：以 UC 驗收為目標完成最小實作，讓 CI 綠燈。
2. **在實作過程中補齊細節**：當你被迫做出決策（例如欄位、constraint、policy、redirect、錯誤碼）時，立即把決策回填到對應文件。
3. **PR 合併前收斂**：PR 的 Definition of Done 包含「文件已回填且一致」，避免知識只留在程式碼與 commit 裡。

**被要求同步更新的文件（隨功能逐步補齊）**：

* `docs/DATA_MODEL.md`：表結構、索引、約束、migrations 方向（必要時附上關鍵 SQL）。
* `docs/SECURITY.md`：多租戶隔離、角色權限、RLS 規則與覆蓋範圍。
* `docs/API_SPEC.md`：路由/server actions 的 request/response、錯誤碼、權限。
* `docs/UX_FLOW.md`：頁面、路由、導頁條件、主要錯誤狀態（手機優先）。
* `docs/ERROR_CODES.md`（若存在或你新增）：集中管理可預期錯誤碼與對應 UX。

> 提醒：這些文件不是要寫成厚重規格，而是用「能驅動實作與驗收」的最小文字/表格，確保新同伴（或代理）能快速接手。

## 3. 開發規則（必遵守）

### 3.1 Multi-tenant + RLS 不可妥協

* 所有資料必綁 `org_id`（建議同時綁 `warehouse_id`）。
* 每張表都要 RLS，並且能說清楚「誰能讀/寫哪些 rows」。
* server actions / API 不能信任 client 傳入的 org_id；必須從 session/membership 推導。

### 3.2 交易/事件不可刪除

* `transactions` 採 append-only。
* 輸入錯誤用後續交易修正（等價沖銷/更正）。
* 若 UI 需要「撤銷」概念，設計成新的交易型別或補償交易（不要 delete）。

### 3.3 保留擴充彈性，但不要過度工程化

* extension points 要「實際可用」：例如保留 `warehouse_id`、保留 join table 的可能性。
* 不要為未來做整套大型框架：例如未來可能多倉庫，但 MVP 先做單倉庫，不要提前做複雜切換 UI。

## 4. 分支策略與 PR 規範

### 4.1 每個 PR 一件事

* 一個 PR 對應：一個 feature slice / 一個修復 / 一個 refactor。
* PR 越小越好：降低 review 與回滾成本。

### 4.2 PR 描述內容（必填）

* **What / Why**：做了什麼、為什麼。
* **Spec linkage**：對應 `docs/features/...` 與 acceptance criteria。
* **Tests**：新增/更新哪些測試；本地如何跑。
* **Risk & Rollback**：風險點與回滾方式。
* **DB/RLS**（若有）：migration、policy 變更與驗證步驟。
* **Docs**（若有決策）：是否回填 `DATA_MODEL / SECURITY / API_SPEC / UX_FLOW / ERROR_CODES`。

### 4.3 Commit 規範（建議）

* 偏好語意化訊息：

  * `feat: ...`, `fix: ...`, `refactor: ...`, `test: ...`, `docs: ...`, `chore: ...`
* 一次 commit 不要混太多不相關檔案。

## 5. 測試與品質門檻

### 5.1 測試層級（最低要求）

* **Unit**：domain rules / validation / pure functions
* **Integration（含 DB + RLS）**：跨 org 權限、寫入限制
* **Minimal e2e（冒煙）**：至少覆蓋「happy path」

### 5.2 對外行為 > 內部實作

我們用測試驗證「預期行為」，避免測試只是複製實作細節：

* 測結果（資料狀態 / response / UI 狀態）
* 少測內部私有函式（除非是純函式且有必要）

### 5.3 Integration tests（需要 DB）規範

- 我們的 CI 會在每次 PR 先執行 supabase start + supabase db reset，確保資料庫 schema（含 migrations/RLS/policies）可從空資料庫重建。
- 測試資料不依賴 seed：每個 integration test 應在測試內自行建立所需資料（Arrange），並在測試結束後清除（Cleanup）。
- 清理策略建議：
  - 優先使用 transaction rollback（若測試框架/連線方式支援）。
  - 或在 afterEach/afterAll 以 TRUNCATE ... RESTART IDENTITY CASCADE 清理測試涉及的表。
  - 測試之間不得共享狀態，確保可平行執行與可重跑。

## 6. DB 變更（Migrations / RLS）

* 任何 schema 變更都要 migration。
* 任何 schema / RLS / policy / index / constraint 變更，一律以 SQL migration 檔提交到 `supabase/migrations/*.sql`。
* 新表必須：

  * primary key / foreign keys
  * 必要索引（查詢熱點）
  * RLS enabled + policies（至少 select/insert/update）
* 禁止直接在 production dashboard 手動修改 schema（包含 table/column/index/constraint/policy）。
  * 若遇到緊急 hotfix，可先處理事故，但必須在同日（或下一個工作日）補回對應 migration 並通過 CI。
* 如果資料不可逆：PR 必須寫明「回滾策略」（通常是停用 UI 入口，不回滾資料）。

## 7. 設計與 UI（手機優先）

* 重要操作（入庫/消耗/盤點）在手機一手可操作：

  * 主要 CTA 不被遮擋（底部 sticky bar 可用）
  * 減少輸入（預設值、快捷按鈕）
* UI 不應把 domain 規則散落在多處：

  * 主要驗證與規則應在 server actions / domain layer
  * UI 只做表單層的即時回饋（例如必填、格式）

## 8. 安全、Secrets 與環境

* 不要把 secrets 放進 repo（含測試）。
* 需要新增 env vars 時：

  * 更新對應文件（例如 `RELEASE_CHECKLIST.md` 或 README 類文件）
  * 在 PR 中寫清楚 preview/prod 的設定要求

## 9. 出問題時的處理方式

* 先寫最小可重現步驟（Steps to Reproduce）。
* 優先加測試覆蓋 bug（回歸測試）。
* 修復後小步重構，避免大爆炸式改動。

## 10. 對代理（Codex / Vercel Agent）的使用準則

* Codex：以「讓 CI 綠燈」為優先，先交付最小功能，再逐步 refactor。
* Vercel Agent：以「preview/prod 行為一致、env/auth/routing 正確」為優先。
* 任何代理輸出都要可審查：

  * 不接受神秘的大量改動
  * 不接受無測試護航的高風險重構

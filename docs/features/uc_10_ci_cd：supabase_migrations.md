# UC-10：CI/CD（Supabase Migrations 佈署 + 文件補齊）

> 目的：把「資料庫 schema / RLS / policies 的變更」以 `supabase/migrations/*` 管理，並在 CI 中完成：PR 驗證 + main 分支自動套用到 Supabase（staging），同時補齊對應文件（release checklist / contribution guide）。

---

## 1. 背景與問題

目前專案採用 **Next.js（App Router）+ Supabase（Postgres/Auth）+ Vercel**。

- DB 變更若只靠手動在 Dashboard 執行 SQL，會造成環境不一致、難以回溯、也不利於 TDD/CI。
- 本專案要求：**多租戶（org_id）+ RLS 覆蓋所有表**，屬於高風險區塊，需要可重播（reproducible）的 migrations 與自動檢查。
- ✅ Supabase 的「GitHub 原生整合 / Branching」需要付費方案（你目前兩個 project 都是 Free），因此 **不能**依賴 Supabase 端自動跑 migrations；仍需要在 GitHub Actions 內完成驗證與部署。
- 我們希望 **Codex** 能在 PR 內完成：
  1) 搭建 CI 流程
  2) 增補文件，讓團隊知道「如何做 DB 變更 / 如何 release」。

---

## 2. 目標（Goals）

### G1 — DB migrations 可重播

- 所有 schema / index / constraint / RLS / policy 變更都必須透過 `supabase/migrations/*.sql` 提交。

### G2 — PR 驗證（不碰遠端 DB）

- PR 時 CI 要跑：lint / typecheck / unit tests（以及可選：local supabase reset 驗證 migrations）。

### G3 — main 自動套用到 staging（遠端 Supabase project）

- 只要 main 有新的 migrations，CI 自動將 migrations `db push` 到 **staging Supabase project**。

### G4 — production 先保守

- MVP 階段：production migrations **先不自動**（改成手動觸發或需 reviewer 的 GitHub environment gate）。

### G5 — 文件補齊

- 更新 `docs/release_checklist.md`、`docs/contribution_guide.md`（以及必要時補充其他 docs），讓規則清楚可操作。

---

## 3. 非目標（Non-goals）

- 不做「每個 PR 自動建立獨立 Supabase 分支/專案」。（MVP 先用 staging/prod 兩個 project）
- 不做完整的資料匯入匯出/自架後端的自動化（未來再擴充）。
- 不在 Vercel build 階段跑 migrations（避免每次 build 都碰 DB）。

---

## 4. Assumptions（先做這些合理假設）

1. ✅ CI 平台為 **GitHub Actions**。
2. repo 目前已有 `supabase/` 目錄（或將由 Codex 補齊）。
3. ✅ 已有兩個 Supabase project：`staging` / `production`。
4. ✅ PR CI 每次都會跑 `supabase start`（啟動本機 services）。
5. ✅ PR CI 會執行 `supabase db reset`，驗證 migrations（含 RLS/policies）可從空 DB 重建。
6. ✅ 測試包含需要資料庫的 integration tests；測試資料採 **C** 策略：測試內自行建立資料，測後清除；不依賴 `supabase/seed.sql`。
7. ✅ 測試框架為 **Vitest**。
8. ✅ CI 會跑 **unit + integration + e2e smoke**（最小 happy path）。
9. ✅ e2e 工具為 **Playwright**，範圍採 **最小 happy path**。
10. ✅ e2e 在 CI 使用 `next build && next start` 後再跑（更接近 production）。
11. ✅ e2e baseURL 固定為 `http://localhost:5566`（固定 port）。
12. ✅ e2e 登入方式：**email + password**。
13. ✅ e2e 測試帳號建立：在測試前用 **Supabase Admin API（service role）** 在 **local supabase** 建立測試 user；並在測試前自動完成 email confirmation。
14. ✅ Supabase Auth 需要 email confirm 才能登入（CI 需自動 confirm）。
15. ✅ production migrations 佈署採用 **手動按鈕（workflow_dispatch）**。
16. ✅ production release gate 採 **GitHub Environments required reviewers**（更硬的限制）。
17. ✅ staging migrations deploy 僅在 `supabase/migrations/**`（可加 `supabase/config.toml`）變更時觸發。
18. ✅ 遠端 migrations 佈署遵守「Developer 做不到就不放 CI」原則：
    - bot 角色為 **Developer**。
    - 遠端佈署採 **DB connection string（DB_URL）** 方式執行 `supabase db push --db-url ...`。
    - DB_URL 使用 **Direct DB connection**。
    - CI 暫時接受使用具備 DDL 權限的 DB user（未來再收斂）。
19. ✅ 需要一個可重現的「local config 產生腳本」：任何開發者執行後，都能從 `supabase start` 的 local 專案狀態產出環境檔供 app / tests 使用。
20. ✅ local config 產出檔位置：`src/.env.local`

---

## 5. 使用者故事（User Stories）

### US-1：開發者（PR）

- 作為開發者，我希望 PR 自動跑 lint/typecheck/tests，確保功能沒有壞。

### US-2：開發者（DB 變更）

- 作為開發者，我希望 DB 變更只要新增 migration SQL 檔就能被檢查與套用，避免手動 drift。

### US-3：Owner（staging 自動更新）

- 作為 Owner，我希望 main 合併後 staging DB 自動升級到最新 schema，方便 preview/驗證。

### US-4：Owner（production 有 gate）

- 作為 Owner，我希望 production schema 變更有明確流程（手動觸發或 reviewer gate），避免誤推。

---

## 6. 規格需求（Requirements）

### 6.1 Repo 結構

- `supabase/migrations/`：存放 migration SQL（檔名為時間戳 + 語意）。
- （可選）`supabase/seed.sql`：本機開發/測試用 seed。
- （可選）`supabase/config.toml`：Supabase CLI config。

### 6.2 GitHub Actions — PR CI

- 觸發：`pull_request`（全部或至少 main 目標分支）。
- 步驟（順序可依實作微調）：
  1) install deps（npm，Node 版本由 `.nvmrc`）
  2) `lint`
  3) `typecheck`
  4) ✅ `supabase start`
  5) ✅ `supabase db reset`（只為了確保 schema/migrations/RLS 可重播；不提供測試資料）
  6) ✅ 跑 unit + integration tests（Vitest）
  7) ✅ `next build`
  8) ✅ `next start -p 5566`（固定 port，對應 Playwright baseURL）
  9) ✅ Playwright：測試前用 **Supabase Admin API（service role）** 建立測試 user 並 **自動 email confirm**
  10) ✅ 跑 e2e smoke tests（Playwright；最小 happy path）

> 設計重點：不依賴 seed，讓測試彼此獨立、可平行、可重跑。

### 6.3 GitHub Actions — main 部署（staging）

- 觸發：`push` to `main` 且變更包含 `supabase/migrations/**`（可加 `supabase/config.toml`）。
- 範圍（MVP）：先只處理 migrations
  - `supabase/migrations/**`
  - （可選）`supabase/config.toml`
- 佈署方式（最小權限、符合 Developer 原則）：
  - 使用 DB 連線字串推 migrations：
    - （建議）`supabase db push --db-url "$SUPABASE_STAGING_DB_URL" --dry-run`
    - `supabase db push --db-url "$SUPABASE_STAGING_DB_URL"`

### 6.4 Production 的安全門（Gate）

- ✅ 本專案採用 **手動按鈕（workflow_dispatch）** 才會跑 production migrations。
- 佈署方式同 staging：
  - （建議）`supabase db push --db-url "$SUPABASE_PROD_DB_URL" --dry-run`
  - `supabase db push --db-url "$SUPABASE_PROD_DB_URL"`
- ✅ Gate 規則（文件流程）：若 staging migrations workflow 紅燈，則規定不得觸發 production workflow。

### 6.5 Vercel 設定

> 原則：Vercel 只負責部署 Next.js；DB migrations 由 GitHub Actions 負責。

- Vercel **Preview**：環境變數連 **staging Supabase**。
- Vercel **Production**：環境變數連 **production Supabase**。

環境變數建議（最小集合）：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（建議）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`（相容 fallback，可與 publishable 擇一）

Server-only（若你有後端需要管理權限/排程/管理 API 才會用到，且必須只在 server runtime 使用）：

- `SUPABASE_SERVICE_ROLE_KEY`（不要加 `NEXT_PUBLIC_` 前綴）

建議做法：

- 在 Vercel 建兩組 env：
  - Preview（對應 staging）
  - Production（對應 production）
- 若你用 Vercel 的 branch env 機制：
  - `main` → Production env
  - 其他 branch/PR → Preview env

### 6.6 文件增補

需要更新（最少）：

#### (A) `docs/contribution_guide.md`

新增/補強章節：**Database & Migrations 工作流**

- 何時需要 migration（schema/RLS/policy/index/constraint 變更）
- 如何新增 migration（檔名規則、內容規範）
- 禁止事項：
  - 禁止直接在 production dashboard 手動改 schema（除非緊急 hotfix，且必須補回 migration）
- PR checklist：
  - migration 是否包含 RLS/policy
  - CI 是否可 `supabase start` + `supabase db reset` + tests 通過

並新增一段（建議放在 Testing/TDD 章節底下，或新增「Integration tests」小節）：

**Integration tests（需要 DB）規範**
- CI 會在每次 PR 先執行 `supabase start` + `supabase db reset`，確保資料庫 schema（含 migrations/RLS/policies）可從空資料庫重建。
- 測試資料**不依賴 seed**：每個 integration test 應在測試內自行建立所需資料（Arrange），並在測試結束後清除（Cleanup）。
- 清理策略建議：
  - 優先使用 transaction rollback（若測試框架/連線方式支援）。
  - 或在 `afterEach/afterAll` 以 `TRUNCATE ... RESTART IDENTITY CASCADE` 清理測試涉及的表。
  - 測試之間不得共享狀態，確保可平行執行與可重跑。

#### (B) `docs/release_checklist.md`
新增/調整章節：**DB Migrations & Environments**
- staging 自動更新、production 手動/審核更新
- release 前後檢查：
  - migrations 全部已套用（列出指令 / 檢查方式）
  - RLS policies 生效、最小權限
  - 若有 breaking change：回滾策略

並新增一段（可直接貼到 `docs/release_checklist.md` 的「Deploy / Production」或「DB Migrations」章節底下）：

**GitHub Environment：production required reviewers 設定（保護 Production migrations）**
1) 進入 GitHub repo → **Settings** → **Environments**。
2) 點 **New environment**（或選已有的）→ 命名為：`production`。
3) 在 `production` environment 中，啟用 **Required reviewers**：
   - 指定允許核准的人（個人帳號或 team）。
   - 建議至少 1 位 reviewer。
4) （可選但建議）啟用 **Wait timer**（例如 0–5 分鐘）視需求。
5) （可選）設定 **Deployment branches**：
   - 若你只想允許 `main` 觸發 production 部署，限制 branches；
   - 若你採手動 workflow_dispatch，也可維持預設，但仍建議在 workflow 內做 branch 檢查。
6) 確認 production migrations workflow 已綁定 environment：
   - workflow 的 deploy job 設定 `environment: production`。
7) 操作流程（release 當天）：
   - 先確認 `supabase-migrate-staging` 在 `main` 最新一次執行為 ✅ success。
   - 再到 Actions 手動觸發 `supabase-migrate-production`。
   - workflow 執行到需要 environment 的 job 會進入 **Waiting for approval**，由 required reviewers 核准後才會繼續。

注意事項：
- required reviewers 只會保護「綁定該 environment 的 job」。請確認 production deploy job 真的有 `environment: production`。
- 若 workflow_dispatch 允許任何有 write 權限的人按下 Run，required reviewers 仍可確保他們無法自行讓 production job 繼續（除非他也在 reviewers 名單內）。
- 這段設定屬於 repo UI 設定，不會隨程式碼同步；release checklist 應把它列為「第一次設定必做」與「定期檢查」項目。

（可選）更新：`docs/agent.md`

- 告訴 agentic AI：DB 變更一定要走 migrations + CI。

---

## 7. Codex 需要完成的工作清單（Deliverables / Tasks）

> 這一節是你要直接交給 Codex 的「待辦清單」。

### T0 — 環境與權限設定（GitHub / Vercel / Codex）

#### T0-1 GitHub Actions Secrets
- [ ] 新增 GitHub Actions secrets：
  - `SUPABASE_STAGING_DB_URL`（Direct DB connection；具備 DDL 權限）
  - `SUPABASE_PROD_DB_URL`（Direct DB connection；具備 DDL 權限）

- [ ]（僅 CI/local 用）Local supabase 的連線資訊由 **local config 產生腳本**產出（不要放到 Vercel）。
  - CI 不需要額外提供 `SUPABASE_LOCAL_SERVICE_ROLE_KEY`：由 `supabase start` 後讀取 local status/config 取得。

#### T0-2 Vercel Environments（Preview / Production）（Preview / Production）（Preview / Production）（Preview / Production）（Preview / Production）
- [ ] Vercel Preview env vars 指向 staging：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（建議）
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`（相容 fallback，可擇一）
- [ ] Vercel Production env vars 指向 production：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（建議）
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`（相容 fallback，可擇一）
- [ ] 目前不設定 `SUPABASE_SERVICE_ROLE_KEY`（降低外洩風險）；需要時再加。

#### T0-3 Codex 工作方式（最重要的規則）
- [ ] 任何 DB schema/RLS/policy 變更都必須以 `supabase/migrations/*.sql` 提交。
- [ ] 不直接在 Supabase Dashboard 修改 production schema（hotfix 例外但必須補回 migration）。
- [ ] 遠端 DB 變更只透過 GitHub Actions workflow 執行。

### T1 — 建立/確認 Supabase CLI 基礎
- [ ] 確認 repo 有 `supabase/migrations/` 結構。
- [ ] 確認本機可執行：`supabase start`、`supabase db reset`。

### T1.1 — 建立 local config 產生腳本（給所有開發者/CI 共用）
- [ ] 新增腳本（例如 `scripts/supabase/local-env.sh` 或 `scripts/supabase/local-env.mjs`）：
  - 先確保 local supabase 已啟動（必要時提示先跑 `supabase start`）
  - 從 `supabase status -o env`（或 local config）取出：
    - `SUPABASE_URL`（local，通常是 `http://127.0.0.1:54321`）
    - `SUPABASE_ANON_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY`
  - ✅ 產出到 `src/.env.local`
  - 檔案內容至少包含：
    - `NEXT_PUBLIC_SUPABASE_URL=<local url>`
    - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable or anon>`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon>`
    - `SUPABASE_SERVICE_ROLE_KEY=<local service role>`（僅 CI/local；不要上 Vercel）
- [ ] 在 `docs/contribution_guide.md` 補上使用方式（新進開發者可照做）。

### T2 — 建立 GitHub Actions：PR CI（含 DB + e2e）
- [ ] 新增 `.github/workflows/ci.yml`
- [ ] 使用 `.nvmrc` 設定 Node 版本，npm 安裝 + cache
- [ ] 跑：lint / typecheck
- [ ] ✅ `supabase start` + ✅ `supabase db reset`
- [ ] ✅ 跑 tests（Vitest：unit + integration）
- [ ] ✅ `next build && next start -p 5566`
- [ ] ✅ 跑 Playwright e2e smoke（最小 happy path）
  - [ ] 在 Playwright test setup：用 local supabase 的 **Admin API（service role）** 建立測試 user
  - [ ] 因為需要 email confirm：在 setup 內 **自動 confirm**（透過 Admin API）

### T3 — 建立 GitHub Actions：main → staging migrations deploy
- [ ] 新增 `.github/workflows/supabase-migrate-staging.yml`
- [ ] 觸發：`push` to main 且 `paths: supabase/migrations/**`（可加 `supabase/config.toml`）
- [ ] MVP 先只處理 `supabase/migrations/**`（可在 workflow 內再做路徑判斷/分支）
- [ ] 使用 DB URL：
  - `supabase db push --db-url "$SUPABASE_STAGING_DB_URL" --dry-run`
  - `supabase db push --db-url "$SUPABASE_STAGING_DB_URL"`

### T4 — 建立 production migrations deploy（手動）
- [ ] 新增 `.github/workflows/supabase-migrate-production.yml`
- [ ] 觸發：`workflow_dispatch`
- [ ] 綁定 GitHub Environment：`production`
  - 在 repo settings 設定 `production` environment 的 **required reviewers**（指定 maintainer/team）
- [ ] 使用 DB URL：
  - `supabase db push --db-url "$SUPABASE_PROD_DB_URL" --dry-run`
  - `supabase db push --db-url "$SUPABASE_PROD_DB_URL"`
- [ ] release 流程規範：若 staging migrations workflow 為紅燈，則不得按 production。

### T5 — Secrets 命名與文件
- [ ] 在 `docs/release_checklist.md` 與/或 `docs/contribution_guide.md` 補上必要 secrets/env vars 清單與用途。

### T6 — 更新 `docs/contribution_guide.md`
- [ ] 加入 migrations 工作流
- [ ] 加入 integration tests 規範（測試自行建資料並清理）

### T7 — 更新 `docs/release_checklist.md`
- [ ] staging 自動、production 手動的 migrations 流程
- [ ] release 前後 DB 檢查項（migrations/RLS/policies）
- [ ] 回滾策略（revert PR + 新 migration 修正）

### T8 — 最小驗證
- [ ] PR CI workflow 跑綠（含 `supabase start` / `db reset` / tests）。
- [ ] main 合併後 staging migrations workflow 可成功 dry-run + push。
- [ ] production workflow 可手動觸發（dry-run + push）。

---

## 8. 驗收標準（Acceptance Criteria）

1. PR 會自動跑 lint/typecheck/test，失敗會擋 PR。
2. main 合併後，staging migrations deploy workflow 會執行，且能成功 `db push`。
3. production migrations 佈署不會自動執行（需手動或審核 gate）。
4. `docs/contribution_guide.md` 與 `docs/release_checklist.md` 已補齊：
   - secrets 命名
   - migration 工作流
   - RLS/policy 要求
   - release 檢查與回滾

> Backlog：CI 如需從 smoke 擴充為 full e2e，另開工作項調整時長與穩定性門檻。

---

## 9. 風險與回滾（Risks & Rollback）

- 風險：migration 寫錯造成 staging schema 不一致或壞掉。
  - 緩解：先 dry-run；本機 `db reset` 驗證；staging 先行。
- 風險：production 誤推。
  - 緩解：production 手動/審核 gate。
- 回滾策略（MVP）：
  - 立即停止 workflow / revert 導致問題的 PR
  - 以新的 migration 修正（優先），避免手動改 DB

---

## 10. 待確認點（更新後）

> 目前所有關鍵決策已定案（含 `.env.local` 放置位置：`src/.env.local`，以及 production environment required reviewers）。本節暫無待確認事項。

（若未來要收斂 DB_URL 權限，或要把 `supabase/functions/**` 納入自動部署，再回來新增。）

# Testing Guide（本機測試）

> 本文件集中整理本機測試的執行方式（unit / integration / e2e）與常見問題。
> 若有新增測試層級或流程，請同步更新此文件。

## 1. 必要前置

- Node.js 與 npm
- Supabase CLI（需要跑 integration / e2e）

## 2. 測試總覽

- Unit：純函式、驗證規則
- Integration：含 DB / RLS 行為
- E2E：最小冒煙流程

## 3. Unit Tests

```bash
npm --prefix src run test:unit
```

## 4. Integration Tests（需要 DB）

1. 啟動 local Supabase

```bash
npx supabase start
```

2. 同步本機 env（必要）

```bash
npm --prefix src run supabase:local-env
```

3. 執行測試

```bash
npm --prefix src run test:integration
```

## 5. E2E Tests（需要 DB + App Server）

### 5.1 啟動 local Supabase + env

```bash
npx supabase start
npm --prefix src run supabase:local-env
```

### 5.2 啟動 App Server（必要）

```bash
npm --prefix src run dev
```

> E2E 不會自動啟動 App Server。執行 `test:e2e` 前必須先啟動，並保持運行。

### 5.3 執行 E2E

```bash
npm --prefix src run test:e2e
```

### 5.3.1 Codex CLI 快速執行

在 Codex CLI 模式中，請使用統一腳本執行 E2E（包含環境準備與啟動 App）：

```bash
scripts/testing/run-e2e.sh
```

#### 參數說明（可選）

可透過環境變數調整；除非必要，請使用預設值：

- `E2E_HOST`：預設 `localhost`（**必須是 localhost**，因為 cookie domain 綁定）。
- `E2E_PORT`：預設 `5566`。
- `E2E_BASE_URL`：預設 `http://<host>:<port>`。
- `E2E_READY_PATH`：預設 `/login`（避免首頁因 auth/SSR 卡住）。
- `E2E_READY_ATTEMPTS`：預設 `10`。
- `E2E_READY_TIMEOUT`：每次嘗試等待秒數，預設 `30`。

範例：

```bash
# 需要更長等待時間（慢機器/首次編譯）
E2E_READY_TIMEOUT=60 E2E_READY_ATTEMPTS=20 scripts/testing/run-e2e.sh
```

```bash
# 改用其他 port（仍需 localhost）
E2E_PORT=5577 scripts/testing/run-e2e.sh
```

### 5.4 Base URL 注意事項（重要）

- 預設 base URL：`http://localhost:5566`（見 `src/playwright.config.mjs`）
- `tests/e2e/auth-state.ts` 會將 cookie domain 設為 `localhost`，因此：
  - **E2E 必須使用 `localhost`**（不是 `127.0.0.1`）
  - 若 App server 用其他 host/port，請設定：

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5566 npm --prefix src run test:e2e
```

## 6. Integration Tests（DB/RLS）規範

- CI 會在每次 PR 先執行 `supabase start` + `supabase db reset`，確保 migrations 可重放。
- 測試資料不依賴 seed：每個 integration test 應自行建立所需資料（Arrange），並在測試結束後清除（Cleanup）。
- 清理策略建議：
  - 優先使用 transaction rollback（若測試框架/連線方式支援）。
  - 或在 afterEach/afterAll 以 `TRUNCATE ... RESTART IDENTITY CASCADE` 清理測試涉及的表。
  - 測試之間不得共享狀態，確保可平行執行與可重跑。

## 7. scripts/supabase/local-env.mjs 使用時機

`node scripts/supabase/local-env.mjs` 的用途是把 local Supabase 的連線資訊同步到 app 的 `src/.env.local`。

建議在以下情境執行：

- 第一次 clone 專案後，完成 `supabase start` 之後。
- local Supabase 重新啟動、reset、或版本更新後（避免 key/url 漂移）。
- 執行需要 local Supabase 的 integration/e2e 測試前。
- `.env.local` 被清空、遺失，或你懷疑內容過期時。

標準流程：

1. `supabase start`
2. `node scripts/supabase/local-env.mjs`
3. 確認 `src/.env.local` 至少包含：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

注意：

- 腳本可重跑（idempotent），會更新既有 key 並補齊缺漏 key，不應產生重複。
- 若 local Supabase 尚未啟動，腳本會提示先執行 `supabase start`。

## 8. 常見問題

- E2E 連不上 App：確認 app 正在跑、base URL 是否對到 `localhost:5566`。
- E2E 連不上 Supabase：確認 `supabase start` 已執行，且 `.env.local` 已更新。
- 若出現 `EPERM` 無法連線 `127.0.0.1:54321` 或無法綁定 `localhost:5566`：
  - 這通常是執行環境禁止本機網路/port 監聽。
  - 解法：改在允許本機網路的環境執行（本機終端），或使用有權限的執行方式啟動測試。

## 9. Production Auth URL 設定（Supabase）

本機 `supabase/config.toml` 只影響 **local Supabase CLI**。上線環境需在 Supabase 專案設定中配置：

- **Site URL**：設定為正式網域（例如 `https://app.yourdomain.com`）
- **Additional Redirect URLs**：加入 `https://app.yourdomain.com/auth/callback`

若有 Preview（例如 Vercel preview），也需加入對應的 callback URL。若 redirect URL 不在 allowlist，Supabase 會回退到 Site URL（可能造成導頁錯誤）。

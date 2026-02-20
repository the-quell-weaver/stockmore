# docs/TEST_STRATEGY.md

> 目的：讓開發可以「小步快跑 + 頻繁重構」但仍維持可預期品質；測試以 **行為驗證** 為主，不綁死實作細節。

## 測試金字塔（MVP）

- **Unit（多）**：純函式/純資料邏輯（例如庫存計算、聚合規則、日期到期判定、低庫存判定）。
- **Integration（中）**：Supabase/Postgres + RLS + DB function / server action 的端到端行為（重點）。
- **E2E（少）**：用 Playwright（或等價）跑 3–6 條最小主流程（手機優先頁面）。

> 原則：能用 unit 測就不要用 integration；但 **RLS / 多租戶隔離 / 交易不可刪** 必須用 integration 測。

## 測試分層與覆蓋範圍

### A. Unit Tests

**目標**：快速回饋、可重構。

建議覆蓋（隨功能逐步擴充）：
- 庫存聚合顯示規則（品名第一層聚合、第二層分量/到期日/存放點可配置）。
- 低庫存判定（`qty < min_qty`）。
- 到期判定（到期前 N 天的門檻）。
- 交易行為：入庫/出庫/調整對庫存變化的計算（注意負數/邊界）。
- 去重策略：通知每日最多一封、同品項同到期日避免重複觸發（先以 pure function 定義）。

### B. Integration Tests（Supabase / Postgres / RLS）

**目標**：保證多租戶資料隔離、RLS policy 正確、DB constraints 正確。

**必測（MVP）**：
1. **租戶隔離（RLS）**
   - user A 只能 select/insert/update 自己 org 的資料。
   - user A 不能讀到 org B；也不能用 insert 偽造 `org_id` 寫入。
2. **Bootstrap / Idempotency（若 UC-01 有自動建立 org/warehouse/membership）**
   - 同一 user 重跑 bootstrap，不會重複建立 org/warehouse。
3. **交易不可任意刪除（後續 UC）**
   - DB 層或 API 層禁止 delete；改用作廢/沖銷機制。

**建議**：使用兩個測試使用者、兩個 org，透過「以 user session 建立 supabase client」的方式跑。

### C. E2E Tests（Playwright）

**目標**：確保最小關鍵流程在瀏覽器真的可用（尤其 auth callback / middleware）。

**MVP 最小用例（建議 3–6 條）**：
- 登入（magic link 或測試替代流程）→ callback → 進入 `/stock`。
- 新增品項 → 入庫 → 庫存列表看到變化。
- 低庫存條件成立時 UI 顯示（通知 job 可先用手動觸發路徑/假資料）。

> 註：如果 magic link 在 CI 不好測，可在測試環境提供「測試登入」替代機制（只在 `NODE_ENV=test` 或專屬 env 開啟）。

## 測試資料與環境

- **本機 Supabase**：優先使用 `supabase start` / `supabase db reset` 建立乾淨 DB。
- 啟動 local Supabase 後，執行 `npm --prefix src run supabase:local-env` 產生 `src/.env.local`（包含 URL/anon(or publishable)/service role），讓 Playwright global setup 可直接建立測試使用者。
- **migrations 必可重放**：CI 每次從空 DB 套 migrations + RLS。
- **seed**：提供最小 seed（org、warehouse、membership、1–2 個 item）供 e2e/integration 使用。

## CI Gate（最小要求）

- `lint` / `typecheck` 必須通過。
- unit + integration 必須通過。
- e2e 可先設為 nightly（或在 PR 先跑最小 1–2 條）但建議 MVP 就至少跑 1 條最短 smoke。

## 何時新增測試（工作節奏）

- 新增功能前：先加「驗收行為」的測試（unit/integration/e2e 擇一）。
- 修 bug：先寫會失敗的測試再修。
- 重構：確保測試能保護對外行為，不綁內部實作。

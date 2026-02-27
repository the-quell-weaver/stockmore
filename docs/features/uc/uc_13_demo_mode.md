<!-- Generated from template.md for UC-13 -->

# Feature: 展示模式（Demo Mode）
- **Doc**: docs/features/uc/uc_13_demo_mode.md
- **Status**: Draft
- **PRD linkage**: UC-13
- **Last updated**: 2026-02-27

## 0. Summary

新使用者在建立帳戶前，可透過 `/demo` 路由直接試用完整的應用程式功能，無需註冊。系統自動以 Supabase Anonymous Sign-in 建立匿名 session，執行現有的 org/warehouse bootstrap 流程，並注入預設 seed 資料，最後跳轉到正式的 `/stock` 介面。

整個流程使用與正式用戶完全相同的 code path，app 程式碼中無任何 `if (isDemo)` 判斷，也無重複邏輯。匿名 session 由 Supabase 自動過期（建議設 72 小時），資料隨之清除，無需自寫清理邏輯。

Seed 資料以 TypeScript fixture 管理，可透過 dev-only 匯出腳本從既有使用者資料複製並更新，preview 與 production 環境皆適用。

## 1. Goals
- G1: 訪客可在不註冊的情況下，透過 `/demo` 試用完整功能。
- G2: Demo 使用與正式用戶完全相同的 code path，維護成本最小。
- G3: Seed 資料易於更新與發布（修改 fixture → commit → deploy）。
- G4: Preview 與 production 環境皆支援 demo。

## 2. Non-Goals
- NG1: Demo session 資料不跨瀏覽器 session 保留。
- NG2: 不實作純本地（localStorage）backend（列為 future work）。
- NG3: Demo 使用者不能升級為正式帳戶（匿名 session 與正式帳戶分離）。
- NG4: 不支援多份 demo 資料集（單一 seed fixture）。

## 3. Scope

### 3.1 MVP scope (must-have)
- S1: `/demo` 路由：middleware 允許無 auth 訪問，自動執行 anonymous sign-in → bootstrap → seed → redirect。
- S2: Supabase Anonymous Sign-in 啟用（Dashboard 設定）。
- S3: `seedDemoData(orgId)` server action：將 `src/lib/demo/seed-fixture.ts` 資料插入新建的 org。
- S4: `src/lib/demo/seed-fixture.ts`：TypeScript 靜態 seed fixture，型別安全。
- S5: `scripts/export-demo-seed.ts`：dev-only 匯出腳本，從 local/staging Supabase 指定 org 匯出 seed fixture 格式。
- S6: 匿名用戶自動過期設定（Supabase Dashboard，建議 72 小時）。
- S7: Preview 與 production 環境皆可使用（只需 Supabase 環境啟用 anonymous auth）。

### 3.2 Out of scope / Backlog hooks (future)
- **純本地版本**：將 Supabase client 替換為 localStorage mock，使 demo 完全不需要網路連線。Extension point：service layer（`lib/items/service.ts`、`lib/transactions/service.ts`）已隔離所有 Supabase 呼叫，未來替換只需在此層抽換實作。
- **Self-hosted backend**：同上，service layer isolation 是統一的 extension point。
- 多份 demo 資料集或使用者選擇情境。
- 匿名用戶升級為正式帳戶（link anonymous → registered）。

## 4. Users & Permissions

### 4.1 Personas / Roles
- 匿名訪客：透過 anonymous sign-in 獲得與正式用戶相同的 owner 角色（在其 demo org 內）。
- Demo org 為獨立租戶，與正式用戶的 org 完全隔離。

### 4.2 Multi-tenant constraints
- 匿名用戶的 org 與正式用戶完全隔離，RLS 強制執行（`org_id` 綁定）。
- Anonymous sign-in 返回真實 JWT，RLS 以 `auth.uid()` 判斷，與正式用戶行為一致。
- Seed 資料插入時使用 server action，`org_id` 從 session 推導，不信任 client 傳入。

## 5. UX (Mobile-first)

### 5.1 Entry points
- Landing page / 登入頁面上的「試用 Demo」CTA 按鈕，指向 `/demo`。
- 直接輸入 `/demo` URL。

### 5.2 Primary flow
1. 訪客點擊「試用 Demo」，瀏覽器導向 `/demo`。
2. Server component 自動執行：
   a. `supabase.auth.signInAnonymously()` — 建立匿名 session
   b. bootstrap RPC — 建立 demo org 與預設 warehouse（現有邏輯）
   c. `seedDemoData(orgId)` — 插入 seed fixture 資料
3. Redirect 至 `/stock?mode=consume`（正式介面）。
4. 使用者看到預填的庫存資料，可完整試用所有功能。

### 5.3 Alternate / edge flows
- **Seed 失敗**：顯示錯誤頁面，引導使用者重試或前往正式註冊。
- **Anonymous sign-in 被 Supabase 停用**：顯示友善錯誤，引導註冊。
- **Session 過期（72h 後）**：使用者重訪 `/demo` 取得新的匿名 session（相同流程重跑）。
- **已有 session 的用戶訪問 `/demo`**：建議 redirect 至 `/stock`，不清除現有 session。

### 5.4 UI notes
- `/demo` 路由本身無需 UI：純 server-side 流程，完成後 redirect。
- Demo 介面與正式介面完全相同，可選擇在頁面頂部加一個 banner 提示「目前為試用模式，資料不會保留」（可選，視產品決策）。

## 6. Data Model Impact

### 6.1 Entities touched
- 無新增欄位或表格。
- 匿名用戶使用現有所有表格（`orgs`, `warehouses`, `org_memberships`, `items`, `batches`, `transactions`）。

### 6.2 Constraints & invariants
- 匿名用戶資料遵守所有現有約束（append-only transactions、RLS 等）。
- Seed 資料插入視為正常交易，不繞過任何約束。

### 6.3 RLS expectations
- 現有 RLS 完全適用。匿名 JWT 的 `auth.uid()` 對 RLS 而言與正式用戶無異。

## 7. Domain Rules
- R1: `/demo` 路由每次訪問皆建立新的匿名 session（不複用舊 session）。
- R2: Seed 資料插入為一次性操作，bootstrap 完成後不會再次 seed。
- R3: Demo org 的資料在匿名 session 過期後由 Supabase 自動清除（或由 Supabase 匿名用戶清理機制處理）。
- R4: App 程式碼中不得有 `if (isDemo)` 或 `if (isAnonymous)` 判斷用於功能分岔。

## 8. API / Server Actions

### 8.1 Actions / Routes

**`/demo` Route Handler (Server Component)**
- 執行 anonymous sign-in → bootstrap → seed → redirect
- 無 request input（純 GET）
- Failure: redirect 至錯誤頁面

**`seedDemoData(input)`（新增 server action）**
- Request: `{ orgId }` （從 session 推導，不接受 client 傳入）
- Response: `{ ok: true }` / `{ ok: false, error: AppErrorCode }`
- AuthZ: org membership（剛 bootstrap 的匿名用戶）
- Idempotency: 若 org 已有資料則 skip（避免重複 seed）
- Failure modes: `FORBIDDEN`, `SEED_FAILED`

### 8.2 Idempotency / Concurrency
- `seedDemoData` 需防止重複執行：可以 `items` 表的 `count > 0` 作為 skip 條件。
- Bootstrap RPC 已有 idempotency 保護（現有邏輯）。

## 9. Export / Portability hooks

- Demo 資料隨匿名用戶過期清除，無需匯出。
- Seed fixture（`src/lib/demo/seed-fixture.ts`）本身版本控制在 git 中，即為「demo 資料的 source of truth」。
- 匯出腳本（`scripts/export-demo-seed.ts`）輸出 fixture 格式，可從 git history 追溯歷史版本。

## 10. Telemetry / Auditability
- 可選：記錄 `/demo` 訪問次數（analytics，非審計需求）。
- 匿名用戶的交易記錄與正式用戶相同（`created_by`, `created_at` 均記錄），隨 session 過期清除。

## 11. Acceptance Criteria
- AC1: 訪客訪問 `/demo` 無需登入，自動完成 anonymous sign-in → bootstrap → seed → redirect。
- AC2: Redirect 後看到包含 seed 資料的 `/stock` 介面，功能與正式用戶完全相同。
- AC3: Demo org 的資料與其他 org 完全隔離（RLS 保護）。
- AC4: App 程式碼中無任何 `if (isDemo)` / `if (isAnonymous)` 功能分岔。
- AC5: 已有正式 session 的用戶訪問 `/demo`，redirect 至 `/stock` 而非清除 session。
- AC6: Seed 重複執行（同 org 再次呼叫 `seedDemoData`）不會建立重複資料。
- AC7: Preview 與 production 環境皆可正常觸發 demo 流程。

## 12. Test Strategy
- **Unit tests**: `seedDemoData` idempotency 邏輯、seed fixture 格式驗證（型別正確性）。
- **Integration tests**: 完整 anonymous sign-in → bootstrap → seed 流程（local Supabase）、RLS 跨 org 隔離（demo org 無法讀取其他 org 資料）。
- **Minimal e2e**: 訪問 `/demo` → redirect 到 `/stock` → 確認 seed 資料顯示。
- **Test data**: seed fixture 本身即為 e2e 測試的資料來源。

## 13. Rollout / Migration Plan
- 無 DB migration（使用現有 schema）。
- Supabase Dashboard 需手動啟用 Anonymous Sign-in（local + preview + production 各自設定）。
- 匿名用戶自動過期需在 Supabase Dashboard 設定（建議 72 小時）。
- 無 feature flag（獨立路由，不影響現有功能）。

## 14. Open Questions
- Q1: `/demo` redirect 後是否在頁面頂部顯示「試用模式」banner？（可選，視產品方向決定）
- Q2: Seed fixture 的資料量：多少品項 / 批次較合適展示用途？（建議 5-8 品項、10-15 批次，含到期與無到期各半）

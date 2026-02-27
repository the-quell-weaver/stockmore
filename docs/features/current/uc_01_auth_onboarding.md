# UC-01 Current State: Auth & Onboarding

- Source spec: `docs/features/archived/uc_01_auth_onboarding.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Product Behavior (Current)
- 支援 Email magic link 與 email+password 登入流程。
- 使用者完成登入後，會建立或取得預設 org/warehouse 作為後續所有庫存操作上下文。
- bootstrap 流程必須可重複執行且不重複建立資料（idempotent）。
- 任何 org/warehouse 範圍都從 session/membership 推導，不接受 client 指定跨租戶資料。

## 2. API / Actions (Current)
- `client signInWithOtp(email)`
  - 目前由 client 端直接呼叫 Supabase Auth（`signInWithOtp`），非 server action。
  - Request: `{ email }`
  - Errors: `AUTH_EMAIL_INVALID`（與 provider auth error）
- `client signInWithPassword(email, password)`
  - 登入成功後應觸發 bootstrap。
- `action bootstrapDefaultOrgAndWarehouse()`
  - Response: `{ orgId, warehouseId }`
  - Errors: `BOOTSTRAP_FAILED`

## 3. Permissions / Security
- Public: 可請求登入（magic link / password）。
- Authenticated: 可執行 bootstrap 取得租戶上下文。
- 多租戶規則：禁止跨 org 存取，RLS 必須拒絕非本 org 資料。

## 4. Known Limits
- MVP 以單人單倉庫為主，未提供多倉庫切換 UI。
- 完整 RBAC（owner/editor/viewer）仍屬後續擴充。

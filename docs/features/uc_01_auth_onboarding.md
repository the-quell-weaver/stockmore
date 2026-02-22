<!-- Generated from template.md for UC-01 -->

# Feature: Auth & Onboarding（登入與預設倉庫建立/取得）
- **Doc**: docs/features/uc_01_auth_onboarding.md
- **Status**: Implemented
- **PRD linkage**: UC-01（使用者登入並建立/取得預設倉庫）
- **Last updated**: 2026-02-22

## 0. Summary
本功能提供使用者以 Email magic link 與 email+password 登入，並在首次登入時自動建立一個「預設倉庫」供後續所有庫存操作使用。系統必須保證多租戶隔離（所有資料綁 org_id），並在任何頁面存取時都能取得使用者目前可用的預設倉庫。MVP 採「單人單倉庫」授權模型，但資料模型與 API 必須保留未來擴充到「多倉庫/共享/角色權限」的路徑。

## 1. Goals
- G1: 使用者可用 Email magic link 或 email+password 成功登入並建立帳號資料。
- G2: 首次登入自動建立（或取得）預設 Org + 預設 Warehouse（或等價實體），並可重複安全地取得。
- G3: 所有後續 feature 能可靠取得 current org/warehouse context（不依賴前端暫存）。

## 2. Non-Goals
- NG1: 不做完整 RBAC（owner/editor/viewer）UI；MVP 先單人模式。
- NG2: 不做多倉庫切換 UI（資料結構保留擴充）。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: Email magic link 與 email+password 登入（Supabase Auth 或等價）。
- S2: Onboarding bootstrap：建立/取得使用者的預設 Org、預設 Warehouse、初始字典（如需要）。
- S3: Session 中能取得 org_id / warehouse_id（server-side 可信來源）。

### 3.2 Out of scope / Backlog hooks (future)
- 多倉庫：保留 warehouse 表與 org-warehouse 關聯，未來可新增多筆。
- 共享與角色：保留 membership/role 的 extension point（org_memberships 表或等價）。
- 自架/本地：匯出/匯入需能重建 org/warehouse + 使用者對應關係。

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP 假設：單一使用者即為 owner（等價）。
- 未來：owner/editor/viewer
  - owner: 管理 org/倉庫/字典/邀請
  - editor: 可新增/修改 items、建立交易
  - viewer: 只讀

### 4.2 Multi-tenant constraints
- 所有資料必須綁 `org_id`，且 warehouse 亦屬於某 org。
- RLS 覆蓋：orgs, warehouses, memberships（若有）, users_profile（若有）。

## 5. UX (Mobile-first)
### 5.1 Entry points
- `/login`：輸入 Email → 送出 magic link
- `/auth/login`：輸入 Email + password
- `/auth/callback`：magic link 回跳

### 5.2 Primary flow
1. 使用者以任一登入入口建立 session：`/login`（magic link）或 `/auth/login`（email+password）。
2. 使用者若走 magic link，點擊 Email 中的連結回到 `/auth/callback` 完成 session；若走 password，送出表單後直接建立 session。
3. 兩種登入方式都在 session 建立後執行 bootstrap：建立/取得預設 Org + 預設 Warehouse。
4. 導向 `/stock`（或首頁），並在頂端顯示倉庫名稱（MVP 固定單倉庫）。

### 5.3 Alternate / edge flows
- 空狀態：首次登入若 context 尚未可用，顯示「完成 onboarding 後會顯示預設倉庫」提示文字（CTA UI 納入 backlog）。
- 錯誤狀態：magic link 過期/無效 → 回到 `/login` 並提示可重新寄送。
- 錯誤狀態：password 錯誤 → 停留 `/auth/login` 並顯示 auth provider 錯誤訊息。
- network：callback/bootstrap 或 password/bootstrap 失敗 → 回到登入入口重試（需 idempotent，且不得直接導向 `/stock`）。

### 5.4 UI notes
- 表單欄位：Email（必填，基本格式驗證）。
- 快速操作：手機上單欄表單、明顯 CTA。
- 桌面版：同流程，允許較寬版面。

## 6. Data Model Impact
### 6.1 Entities touched
- Tables: `auth.users`（Supabase）、`orgs`、`warehouses`、`org_memberships`（MVP 會建立；bootstrap 寫入預設 role=owner）、`user_profiles`（可選）
- New columns (if any): `orgs.created_by`, `warehouses.is_default`（或用 unique constraint 保證 1 筆）
- New tables (if any): `org_memberships`（若 repo 尚未建立；MVP 需要，以鋪路共享/角色）

### 6.2 Constraints & invariants
- 每個 org 至少 1 個 warehouse。
- MVP：每個使用者只有 1 個 org，且 org 只有 1 個 warehouse（用 constraint 或 bootstrap 保證）。
- referential integrity：warehouses.org_id → orgs.id；memberships.org_id → orgs.id。

### 6.3 RLS expectations (high level)
- user 只能讀寫自己所屬 org 的 org/warehouse rows。
- row 屬於 org 的方式：row.org_id 與使用者 membership org_id 相符。

## 7. Domain Rules
- R1: Bootstrap 必須 idempotent：重複執行不會建立多個預設 org/warehouse。
- R2: 任何需要 org/warehouse context 的 server action 必須從 session/membership 推導，不信任 client 傳入。
- R3: 不允許跨 org 存取，即使 client 嘗試指定其他 org_id。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `action requestMagicLink(email)`（或 Supabase client auth）
  - Request: `{ email }`
  - Response: `{ ok: true }`
  - AuthZ: public
  - Validation: email 格式
  - Failure: `AUTH_EMAIL_INVALID`（其餘 provider error 以 generic auth error 顯示）

- `client signInWithPassword(email, password)`（Supabase client auth）
  - Request: `{ email, password }`
  - Response: session 建立後需立即執行 bootstrap
  - AuthZ: public
  - Failure: provider auth error 或 `BOOTSTRAP_FAILED`

- `action bootstrapDefaultOrgAndWarehouse()`
  - Request: none
  - Response: `{ orgId, warehouseId }`
  - AuthZ: authenticated user
  - Validation: session user_id 存在
  - Failure: `BOOTSTRAP_FAILED`

### 8.2 Idempotency / Concurrency
- magic link：Supabase 內建處理。
- bootstrap：
  - 使用 unique constraint（如 `orgs.owner_user_id unique` 或 `memberships(user_id, org_id) unique`）避免重複建立。
  - 用 DB transaction 包住「查找→不存在則建立」流程。

## 9. Jobs / Notifications (if applicable)
- 不適用。

## 10. Export / Portability hooks (architecture requirement)
- 需要被匯出的表/事件：`orgs`, `warehouses`, `org_memberships`（或等價關聯）。
- 最小可重建資訊：schema_version、org_id、warehouse_id、membership(user_id/email mapping)。
- replay/rebuild 假設：匯入端可先建立使用者（或以 email 映射），再重建 org/warehouse 與 membership。
- 相容性/版本策略：匯出檔包含 schema_version；匯入時做 migration 或拒絕過舊版本。

## 11. Telemetry / Auditability
- 記錄：org/warehouse created_at, created_by。
- 查詢：以 user_id 找到其預設 org/warehouse。

## 12. Acceptance Criteria
- AC1: Given 新使用者 When 完成 magic link 或 password 登入 Then 系統自動建立預設 org 與 warehouse，並導向庫存頁。
- AC2: Given 已有預設 org/warehouse When 重新登入或重跑 bootstrap Then 不會建立重複資料，回傳同一組 id。
- AC3: Given 使用者 A When 嘗試讀取使用者 B 的 org/warehouse Then 受到 RLS 拒絕。

## 13. Test Strategy (feature-level)
- Unit tests: bootstrap 的「已存在/不存在」分支、idempotency；password login 後 bootstrap 成功/失敗分支。
- Integration tests (DB + RLS): 驗證 membership/org RLS；跨 org 查詢失敗。
- Minimal e2e（smoke，拆成兩段）：
  - login 頁可成功送出 magic link request（含 callback redirect 參數檢查）
  - 已登入使用者可進入 `/stock` 並顯示預設倉庫名稱
- Fixtures: 建立兩個 user、兩個 org。

## 14. Rollout / Migration Plan (if applicable)
- DB migrations: 新增 orgs/warehouses/memberships（若尚未存在）。
- Backfill: 不需要。
- Feature flag: 不需要。
- 回滾策略：保留資料（不刪除），僅下線入口。

## 15. Open Questions
- （已釐清）MVP 先建立 `org_memberships` 以鋪路共享/角色；但 MVP 不配置相應 UI/商業邏輯，僅在 bootstrap 寫入預設值（role=owner 等價）。
- （Backlog）預設 warehouse 命名策略的 UI 修改為低優先需求，已記錄於 PRD 的 Backlog 章節。
- （Backlog）端到端 callback 全流程（login → callback → stock）e2e 暫以 smoke 分段覆蓋；完整單測試串接流程後續補齊。

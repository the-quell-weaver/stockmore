# docs/API_SPEC.md（Template）

> 本文件定義對外（或對前端）可依賴的 API 介面：Route Handlers、Server Actions、（可選）RPC/DB functions。
> **填寫原則**：每個 endpoint/action 都要可對應到 feature 的 acceptance criteria，並可測。

## 0. 文件目的與範圍

- 涵蓋哪些 UC
  - UC_01 Auth & Onboarding：magic link 登入與 callback
- 介面類型（Route Handlers vs Server Actions vs Supabase RPC）採用原則

## 1. 通用約定

### 1.1 Base URLs / Routing

- Next.js routes 的基本結構（app router）
- Auth callback 路徑：`/auth/callback`（magic link 回跳）

### 1.2 Auth / Session

- 哪些介面需要登入
- session 取得方式（server-side cookies、supabase client）

### 1.3 Tenant Context

- `org_id`/`warehouse_id` 的取得方式（不可由 client 信任傳入的規則）
- 若缺 context 的處理（bootstrap / error）

### 1.4 Pagination / Filtering / Sorting（若適用）

- query 參數格式
- 預設排序

### 1.5 Error Model（與 ERROR_CODES 對齊）

- 統一錯誤格式（JSON schema）
- HTTP status 對應
- 前端如何呈現（簡述）

## 2. Endpoints / Actions Index

- 清單（表格）：Name | Method/Type | Path/Identifier | Auth | Purpose | UC

| Name | Method/Type | Path/Identifier | Auth | Purpose | UC |
| --- | --- | --- | --- | --- | --- |
| requestMagicLink | Client action | Supabase `auth.signInWithOtp` | Public | 發送 magic link | UC_01 |
| authCallback | Route Handler | `GET /auth/callback` | Public | 驗證 magic link 並建立 session | UC_01 |

## 3. 介面規格（逐項）

> 每個 endpoint/action 用相同格式。

### 3.1 `requestMagicLink`

**Type**
- Client action (Supabase JS)

**Purpose**
- 讓使用者輸入 email，送出 magic link

**Auth**
- public

**Request**
- Body: `{ email }`
- Validation: email 格式

**Response**
- 成功：Supabase 回傳 200

**Errors**
- `AUTH_EMAIL_INVALID`

**Notes**
- `emailRedirectTo` 設為 `/auth/callback?next=/stock`

### 3.2 `authCallback`

**Type**
- Route Handler

**Purpose**
- 驗證 magic link token，建立 session，導向 next

**Auth**
- public

**Request**
- Query: `token_hash`, `type`, `next`

**Response**
- 307 redirect to `next`（預設 `/stock`）

**Errors**
- `AUTH_LINK_INVALID_OR_EXPIRED`

**Notes**
- `next` 需經 sanitize，避免 open redirect

### 3.x `<name>`

**Type**
- Route Handler / Server Action / RPC

**Purpose**
- 解決什麼問題、對應哪些 UC/Acceptance

**Auth**
- 需要登入？需要什麼角色？

**Request**
- Headers（若適用）
- Body schema（JSON/form）
- Query params（若適用）
- Validation rules（必填/格式/範圍）

**Response**
- Success schema（含範例）
- Side effects（寫入哪些表）

**Errors**
- 可能錯誤碼清單（連到 ERROR_CODES）
- 對應 HTTP status

**Notes**
- Idempotency（是否需要、如何保證）
- Rate limit（若適用）

## 4. 權限矩陣（摘要）

- 角色 × 介面 × 動作（表格）

## 5. Observability

- logs 應記錄什麼（request id、user id、org id，避免 token/PII）
- 對於失敗案例的 debug 建議

## 6. 測試對應

- 每個介面至少對應一個：unit/integration/e2e
- 指向測試檔案路徑或測試案例 ID（可選）

## 7. 版本與相容性

- breaking change 定義
- deprecate 流程

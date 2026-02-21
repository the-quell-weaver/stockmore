# docs/API_SPEC.md（Template）

> 本文件定義對外（或對前端）可依賴的 API 介面：Route Handlers、Server Actions、（可選）RPC/DB functions。
> **填寫原則**：每個 endpoint/action 都要可對應到 feature 的 acceptance criteria，並可測。

## 0. 文件目的與範圍

- 涵蓋哪些 UC
  - UC_01 Auth & Onboarding：magic link 登入、callback、bootstrap RPC
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
| bootstrapDefaultOrgAndWarehouse | RPC | `bootstrap_default_org_and_warehouse()` | Authenticated | 建立/取得預設 org/warehouse | UC_01 |
| stockPageGuard | Server page guard | `GET /stock` | Authenticated | 驗證 session 並回傳 stock 畫面 | UC_01 |
| org/warehouse/membership RLS | DB Policy | `orgs`,`warehouses`,`org_memberships` | Authenticated | 阻擋跨租戶讀寫（AC3） | UC_01 |
| createItem | Server Action | `createItemAction` | Authenticated (owner/editor) | 建立 item 主檔 | UC_02 |
| updateItem | Server Action | `updateItemAction` | Authenticated (owner/editor) | 編輯 item 主檔（含 soft-delete） | UC_02 |
| listItems | Server-side query | `listItems` | Authenticated (viewer+) | 以名稱關鍵字列出 items | UC_02 |

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
- Query: `token_hash`, `type`, `next` 或 `code`

**Response**
- 307 redirect to `next`（預設 `/stock`）

**Errors**
- `AUTH_LINK_INVALID_OR_EXPIRED`
- `BOOTSTRAP_FAILED`

**Notes**
- `next` 需經 sanitize，避免 open redirect

### 3.3 `bootstrapDefaultOrgAndWarehouse`

**Type**
- RPC (Postgres function)

**Purpose**
- 取得或建立使用者預設 org + warehouse（idempotent）

**Auth**
- authenticated user

**Request**
- none

**Response**
- `{ org_id, warehouse_id }`

**Errors**
- `BOOTSTRAP_FAILED`

**Notes**
- 以 unique constraint + transaction 保證 idempotent

### 3.4 `GET /stock`

**Type**
- App Router Server Page + Proxy guard

**Purpose**
- 提供 UC_01 登入完成後的受保護落地頁，並可讀取 server-side org/warehouse context。

**Auth**
- authenticated user

**Request**
- none

**Response**
- 200：渲染 stock 頁面，含 `getAuthContext()` 查得的倉庫資訊。
- 未登入：redirect 到 `/login?error=AUTH_REQUIRED&next=/stock`。

**Errors**
- `AUTH_REQUIRED`

**Notes**
- 先經 `src/proxy.ts` 的 middleware guard，再由 `requireUser()` 在 server component 再驗證一次。

### 3.5 `createItemAction`

**Type**
- Server Action

**Purpose**
- 建立 item 主檔（名稱、單位、最低庫存、備註）

**Auth**
- authenticated owner/editor

**Request**
- FormData: `{ name, unit, minStock, defaultTagId?, note? }`
- Validation: `name` 必填；`unit` 必填；`minStock >= 0`

**Response**
- Success: redirect `/stock/items?success=created`

**Errors**
- `ITEM_NAME_REQUIRED`
- `ITEM_UNIT_REQUIRED`
- `ITEM_MIN_STOCK_INVALID`
- `ITEM_NAME_CONFLICT`
- `FORBIDDEN`

### 3.6 `updateItemAction`

**Type**
- Server Action

**Purpose**
- 更新 item 管理欄位，支援 soft-delete（`is_deleted`）

**Auth**
- authenticated owner/editor

**Request**
- FormData: `{ itemId, name?, unit?, minStock?, defaultTagId?, note?, isDeleted? }`

**Response**
- Success: redirect `/stock/items?success=updated`

**Errors**
- `ITEM_NOT_FOUND`
- `ITEM_NAME_REQUIRED`
- `ITEM_UNIT_REQUIRED`
- `ITEM_MIN_STOCK_INVALID`
- `ITEM_NAME_CONFLICT`
- `FORBIDDEN`

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
- UC_01 PR#4：`src/tests/integration/rls/multi-tenant-auth.integration.test.ts` 驗證跨 org select/insert/update 被 RLS 阻擋。

## 7. 版本與相容性

- breaking change 定義
- deprecate 流程

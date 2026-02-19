# Coding Convention（TypeScript / Next.js / Supabase）

> 目標：一致、可讀、好重構。
> 我們不追求最嚴苛的規範，但希望用主流工具把「格式與常見錯誤」自動化，讓團隊把注意力放在 domain 與產品行為。

## 1. 工具與設定（主流推薦）

### 1.1 TypeScript
- `tsconfig.json` 建議：
  - `"strict": true`
  - `"noUncheckedIndexedAccess": true`（如果現況負擔太大可延後）
  - `"exactOptionalPropertyTypes": true`（可延後）

### 1.2 Lint / Format
你沒有特定偏好，建議採主流組合：
- ESLint：`eslint-config-next` + `@typescript-eslint`
- Formatter：Prettier
-（可選）pre-commit：lint-staged + husky

原則：
- **格式交給 Prettier**（不要在 code review 糾結排版）
- ESLint 專注在：錯誤、壞味道、危險用法

## 2. 專案結構與邊界

### 2.1 Next.js App Router 分層
- `src/app/**`：頁面與路由
  - 預設用 **Server Components**
  - 需要互動才加 `"use client"`
- `src/components/**`：可重用 UI（盡量純 presentational）
- `src/lib/**`：共用工具（supabase client、auth helpers、logger、date utils）
- `src/domain/**`（建議）：商業規則與 domain operations（與 UI/DB 解耦）
- `src/server/**`（建議）：server actions、repositories、jobs runner

> 原則：domain 規則不要散落在 UI；UI 不應成為唯一真相。

### 2.2 Server / Client 邊界
- Server actions：處理權限、驗證、交易一致性（DB transaction）、domain rules。
- Client：只做表單/互動、即時格式檢查、錯誤顯示。

## 3. TypeScript 寫法準則

### 3.1 命名
- 檔名：
  - React component：`PascalCase.tsx` 或 `kebab-case.tsx`（二擇一，建議 repo 內一致）
  - 非 component：`kebab-case.ts`
- 變數/函式：`camelCase`
- 型別/介面/enum：`PascalCase`
- boolean：`isX / hasX / canX / shouldX`

### 3.2 型別策略
- 優先用**明確的型別與小型物件**，避免巨大「萬用型」：
  - ✅ `type CreateItemInput = { name: string; unit: string; minStock: number }`
  - ❌ `type AnyPayload = Record<string, any>`
- 避免 `any`：
  - 用 `unknown` + runtime validation（例如 Zod）
- `null` vs `undefined`：
  - 對外 API/DB 欄位：盡量明確（DB null 就用 null）
  - TS optional property：代表 undefined

### 3.3 早回傳（Guard Clauses）
- 以 guard clauses 降低巢狀：
  - 權限不符：直接 throw/return
  - 驗證不過：直接回錯

### 3.4 不要過度抽象
- 抽象的前提是「重複」或「可預期變動」。
- 當下只有一個使用點時，先用直覺可讀的寫法。

## 4. 錯誤處理與回傳格式

### 4.1 一致的錯誤碼
- Server actions / API 回傳錯誤時，使用固定 error code（string union）。
- UI 只依賴 error code 決定提示，不依賴 DB/SDK 的原始訊息。

建議型別：
- `type AppErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | ...`（依 feature spec 擴充）

### 4.2 例外（throw） vs 結果（Result）
- 對於「預期內失敗」（驗證、權限、找不到）：建議回 `Result`（或 structured error）。
- 對於「不應該發生」（bug、不可用狀態）：throw 並讓 error boundary / logging 捕捉。

## 5. 資料存取（Supabase / Postgres）

### 5.1 任何寫入都要走 Server
- 不在 client 直接用 service role。
- client 用 session token 做 read（若需要）可以，但寫入仍建議透過 server actions 以集中規則與驗證。

### 5.2 Multi-tenant context
- 不接受 client 傳入 `org_id` 當作可信來源。
- server 端：從 session / membership 推導 `org_id`、`warehouse_id`。

### 5.3 交易一致性
- 入庫/消耗/盤點：必須同一個 DB transaction
  - 寫入 `transactions`（append-only）
  - 更新/建立 `batches`

### 5.4 Idempotency
- 會被使用者雙擊/重送的寫入（特別是 transactions）：
  - 使用 `idempotency_key`（client 生成 UUID）
  - DB unique `(org_id, idempotency_key)`

## 6. React / UI 準則（手機優先）

- 表單：
  - 重要 CTA（儲存/送出）用 sticky bottom bar
  - 預設值合理（減少輸入）
- 列表：
  - 主要資訊（品名/數量）更醒目
  - 次要資訊（到期/存放點/標籤）可缺省
- 避免把 domain 規則寫在多個 component：
  - 驗證規則以 server 為主，UI 做輕量即時提示

## 7. 測試規範（與 TDD 協作）

### 7.1 Unit tests
- 測 domain rules 與 validation：
  - quantity 邊界（整數/小數、不得為負）
  - 去重 key 生成
  - low stock 聚合計算

### 7.2 Integration tests（DB + RLS）
- 最重要：跨 org 必拒絕。
- viewer / editor / owner（若已實作 RBAC）寫入權限正確。

### 7.3 Minimal e2e
- 冒煙測：登入 → 入庫 → 庫存列表 → 消耗/盤點 → 通知設定。

## 8. 文件與規格同步

- 需求變更先改 `docs/`：
  - feature spec 的 Scope / Domain Rules / Acceptance Criteria
- 程式碼變更必能對應 spec：
  - PR 連結 spec 段落
  - 新增測試對應 AC

## 9. 建議的自動化（可選）

- `npm run lint`：eslint
- `npm run format`：prettier
- `npm test`：unit/integration
- `npm run e2e`：playwright（若有）

> 若 repo 尚未建立以上腳本與工具，先以最小集合導入：eslint-config-next + prettier + unit tests。


# docs/UX_FLOW.md（Template）

> 本文件描述頁面與主要流程（手機優先），並明確定義路由/導頁/狀態/錯誤處理，避免實作與規格分歧。
> **填寫原則**：用「流程圖式」的文字與表格，讓人能快速照著走一次。

## 0. 文件目的與範圍

- 涵蓋哪些 UC
  - UC_01 Auth & Onboarding（login + callback + stock landing）
- 手機優先原則與設計假設（單手操作、少輸入）

## 1. IA / Navigation 概覽

- 主要導覽結構（底部 tab / 側欄 / 單層導覽）
- 登入前/登入後可見的入口

## 2. 路由清單（Index）

- 表格：Route | Page name | Auth required | Primary actions | UC

| Route | Page name | Auth required | Primary actions | UC |
| --- | --- | --- | --- | --- |
| `/login` | Login | No | Send magic link | UC_01 |
| `/auth/callback` | Auth callback | No | Verify token + redirect | UC_01 |
| `/stock` | Stock | Yes | View default warehouse | UC_01 |

## 3. 全域狀態與導頁規則

- 未登入導向（middleware 或 layout guard）
- Tenant context 缺失的處理（bootstrap / onboarding / error）
- Loading / Empty / Error 的一致呈現規範

## 4. Flow（逐 UC / 逐流程）

> 每個流程用相同格式。

### 4.1 `Magic link login`

**Goal**
- 使用者登入並進入庫存頁

**Entry points**
- `/login`

**Happy path（步驟序列）**
1. 使用者輸入 email，送出 magic link
2. 使用者點擊 email 內連結回到 `/auth/callback`
3. 系統建立 session 後導向 `/stock`

**Screens involved**
- `/login` → `/auth/callback` → `/stock`

**Validation & error handling**
- email 格式驗證：`AUTH_EMAIL_INVALID`
- magic link 過期/無效：回 `/login` 顯示 `AUTH_LINK_INVALID_OR_EXPIRED`

**Edge cases**
- 未登入存取 `/stock` → 導向 `/login`（`AUTH_REQUIRED`）

**Mobile UX notes**
- 單欄表單、單一 CTA

### 4.x `<Flow name>`

**Goal**
- 使用者想完成什麼

**Entry points**
- 從哪些頁面/按鈕進入

**Happy path（步驟序列）**
1. ...
2. ...

**Screens involved**
- 對應的 routes/pages

**State transitions**
- 哪些狀態會改變（例如選定 warehouse、表單狀態、列表更新）

**Validation & error handling**
- 表單驗證規則（即時/送出）
- 常見錯誤碼與 UI 呈現（連到 ERROR_CODES）

**Edge cases**
- 離線/網路慢
- 重複提交
- 權限不足

**Mobile UX notes**
- 主要 CTA 位置（底部）
- 輸入最佳化（預設值、快捷按鈕）

## 5. 頁面規格（逐頁）

> 每個頁面用相同格式，保持短小。

### 5.x `<Route>` — `<Page title>`

- **Purpose**：此頁做什麼
- **Auth**：需要登入/角色
- **Primary CTA**：主要操作
- **Components**：主要 UI 組件（表單、列表、搜尋列）
- **Data dependencies**：需要讀哪些資料、何時讀（server/client）
- **Empty states**：沒有資料時怎麼呈現
- **Error states**：失敗時怎麼呈現（錯誤碼/重試）
- **Tracking/Logs（可選）**：記錄哪些事件

### 5.1 `/login` — Login

- **Purpose**：輸入 email 送出 magic link
- **Auth**：不需要登入
- **Primary CTA**：Send magic link
- **Components**：Email input、送出按鈕、錯誤提示
- **Empty states**：無（初始空白）
- **Error states**：`AUTH_EMAIL_INVALID`, `AUTH_LINK_INVALID_OR_EXPIRED`

### 5.2 `/auth/callback` — Auth callback

- **Purpose**：驗證 magic link token 並導向 `/stock`
- **Auth**：不需要登入
- **Primary CTA**：無（系統導向）
- **Error states**：`AUTH_LINK_INVALID_OR_EXPIRED`

### 5.3 `/stock` — Stock

- **Purpose**：顯示已登入狀態與預設倉庫空狀態
- **Auth**：需要登入
- **Primary CTA**：無（MVP）
- **Empty states**：顯示「尚未建立」提示
- **Error states**：`AUTH_REQUIRED`

## 6. 文案與本地化（可選）

- 核心提示文案的位置與原則
- i18n 需求（若未做可標註 future）

## 7. 可用性與無障礙（最小要求）

- 表單 label / error message
- 觸控區大小
- 鍵盤操作（至少不阻斷）

## 8. 測試對應

- 每個流程至少 1 條 e2e 或 integration 覆蓋
- 指向測試檔案/案例
- `src/e2e/login-magic-link.spec.ts`（login magic link smoke）

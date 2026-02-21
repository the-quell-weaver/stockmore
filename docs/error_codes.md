# docs/ERROR_CODES.md（Template）

> 本文件集中管理「可預期錯誤」：錯誤碼、觸發條件、HTTP status、UI 呈現與可重試性。
> **填寫原則**：只收錄產品/領域層面的錯誤（不是程式例外堆疊）。每個錯誤碼都要能在測試中被觸發與驗證。

## 0. 文件目的與使用方式

- 什麼情況要新增錯誤碼
- 什麼情況不要新增（直接用 generic error）
- 與 `API_SPEC.md`、`UX_FLOW.md` 的關聯

## 1. 錯誤碼命名規範

- 格式（例如 `AUTH_*`, `ORG_*`, `ITEM_*`, `TXN_*`, `STOCK_*`, `NOTIF_*`）
- 穩定性原則（錯誤碼是對外 contract，不輕易改）

## 2. 通用錯誤格式（Error Envelope）

- JSON schema（欄位：`code`, `message`, `details`, `retryable`, `request_id`…）
- 前端顯示原則（message vs i18n key）

## 3. 錯誤碼總表（Index）

- 表格：Code | Category | HTTP status | Retryable | User-facing message（短） | Used by (API/Flow) | Notes

| Code | Category | HTTP status | Retryable | User-facing message | Used by | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTH_EMAIL_INVALID` | Auth | 400 | Yes | Email 格式不正確 | Login | 前端驗證 + 伺服器回應 |
| `AUTH_LINK_INVALID_OR_EXPIRED` | Auth | 400 | Yes | Magic link 無效或過期 | Auth callback | 回到 `/login` 可重送 |
| `BOOTSTRAP_FAILED` | Auth | 500 | Yes | 初始化帳號失敗 | Onboarding | 可重試（需 idempotent） |
| `AUTH_REQUIRED` | Auth | 401 | Yes | 請先登入 | Protected routes | 導向 `/login` |

## 4. 錯誤碼詳述（逐條）

> 每個錯誤碼用相同格式。

### 4.x `<ERROR_CODE>`

- **When**：什麼條件會發生（可列出前置狀態/輸入）
- **Where**：可能在哪些 API / server action / page flow 觸發
- **HTTP status**：預期回傳狀態碼
- **Retryable**：可否重試？重試建議（立即/稍後）
- **User message**：給使用者看的簡短訊息（可搭配 i18n key）
- **Developer notes**：log 建議（要記錄哪些欄位，避免 PII）
- **Test coverage**：應有哪些測試覆蓋（unit/integration/e2e）

### 4.1 `AUTH_EMAIL_INVALID`

- **When**：email 格式驗證失敗
- **Where**：`/login`
- **HTTP status**：400
- **Retryable**：可立即重試
- **User message**：請輸入正確的 email
- **Test coverage**：unit（email 驗證）

### 4.2 `AUTH_LINK_INVALID_OR_EXPIRED`

- **When**：magic link token 無效或過期
- **Where**：`/auth/callback`
- **HTTP status**：400
- **Retryable**：可立即重送
- **User message**：登入連結失效，請重新寄送
- **Test coverage**：integration（callback 分支）

### 4.3 `BOOTSTRAP_FAILED`

- **When**：建立/取得預設 org/warehouse 失敗
- **Where**：`/auth/callback`, onboarding bootstrap
- **HTTP status**：500
- **Retryable**：可重試（需 idempotent）
- **User message**：初始化失敗，請稍後再試
- **Test coverage**：integration（bootstrap）

### 4.4 `AUTH_REQUIRED`

- **When**：存取受保護頁面但尚未登入
- **Where**：`/stock` 等受保護頁
- **HTTP status**：401
- **Retryable**：可登入後重試
- **User message**：請先登入
- **Test coverage**：integration（route guard）

## 5. 類別附錄（可選）

- Auth errors
- Validation errors
- Permission/RLS errors（是否映射成同一類 user-facing code）
- DB constraint errors（如何 mapping）

## 6. 變更紀錄（可選）

- 新增/修改/棄用錯誤碼的紀錄

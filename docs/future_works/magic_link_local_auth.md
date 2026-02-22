# Future Work: Local Magic Link 登入穩定化（暫時結案）

## 背景與目前狀態
- 問題範圍：本機環境（local Supabase + Next.js dev server）使用 magic link 登入時，經常在 callback 後被導回 `/login?error=AUTH_REQUIRED` 或顯示連結失效。
- 目前判定：此問題主要是「本機 loopback host 與 session/cookie 寫入時序」相關，不是單純 magic link 郵件發送失敗。
- 現況：此議題已耗費較多開發時間，先暫時結案，待後續排程重啟。

## 已觀察到的症狀
- 使用者可收到 magic link 郵件，點擊後 callback route 能收到 `code`。
- server log 可見 `/auth/callback?...` 回 307，但後續進入 `/stock` 時仍被當成未登入，導回 `/login?error=AUTH_REQUIRED&next=%2Fstock`。
- 在同一機器上，`localhost` 與 `127.0.0.1` 混用時，失敗機率明顯上升；全程固定 `localhost` 時可成功登入。

## 已完成的調查與嘗試（摘要）
- 將 callback `code` 交換流程收斂為 server-side（移除 client-side `/auth/exchange` 交換頁）。
- 增加 callback 診斷日誌（host、hasCode、錯誤代碼/訊息）。
- 移除 login 中將 loopback host 強制改寫為 `localhost` 的邏輯，改為使用 `window.location.origin`。
- 在 dev 環境加入 loopback canonical host 導向與 `allowedDevOrigins` 設定。
- 將 callback route 改為可將 Supabase `setAll` cookies 明確套用到 redirect response。
- 將 route guard / requireUser 由 `getClaims()` 改為 `getUser()`，避免 callback 後誤判未登入。

## 目前困難點（尚未徹底收斂）
- 本機開發工具（例如 VSCode Port UI）可能以 `127.0.0.1` 打開入口，與使用者手動開啟的 `localhost` 流程混雜。
- callback 成功後，session cookie 在不同 host / redirect 鏈上的可見性與生效時機，仍可能受本機環境差異影響。
- 現有測試雖涵蓋 callback 行為與多數流程，但未完整覆蓋「真實郵件連結點擊後」的跨 host 場景。

## 後續建議方向（重啟時執行）
1. 建立最小可重現腳本（單一命令）
- 固定啟動參數、固定 host、固定 callback URL、固定 Supabase local env。
- 自動完成：送出 magic link、抓取本機郵件內容、開啟驗證連結、驗證最終 session 與 `/stock` 存取。

2. 強化觀測資料（以事件鏈追蹤）
- 在 `/auth/callback`、guard、`/stock` 各節點記錄 request host、set-cookie 摘要、cookie key 是否存在。
- 產生單次登入 trace id，串聯整條登入鏈路日誌，避免人工比對困難。

3. 明確定義本機 canonical host 策略
- 策略 A：全面固定 `localhost`（推薦）。
- 策略 B：全面固定 `127.0.0.1`。
- 僅保留一種預設策略，另一種視為 fallback，不在同一次流程混用。

4. 增加真實 E2E（非僅 API mock）
- 新增「mailbox -> click verify link -> callback -> stock」完整 e2e。
- 將此測試納入 smoke 或 nightly，以防回歸。

## 重新開案的驗收標準
- AC1：以本機標準啟動流程，連續 20 次 magic link 登入成功率 100%。
- AC2：從 VSCode Port UI 與手動網址輸入兩種入口都可成功（不因 host 表現差異失敗）。
- AC3：callback 後首次進入 `/stock` 不得再出現 `AUTH_REQUIRED` 回跳。
- AC4：新增的真實 magic-link e2e 在 CI 或可重現環境中穩定通過。

## 記錄日期
- 2026-02-22（暫時結案，列入 future works）

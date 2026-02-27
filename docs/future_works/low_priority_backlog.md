# 低優先工作清單（Low Priority Backlog）

> 本清單收錄「暫時結案、非 MVP 阻塞、後續有餘裕再重啟」的工作項目。

## 項目

1. Local Magic Link 登入穩定性（Auth）
- 狀態：暫時結案（待重啟）
- 詳細文件：`docs/future_works/magic_link_local_auth.md`
- 主要原因：本機 loopback host 與 callback 後 session/cookie 判定在特定開發路徑下仍不穩定，需獨立時段做端到端重現與收斂。

2. Email 通知（到期 / 低庫存）
- 狀態：規格後移（待重啟）
- 相關規格：`docs/features/uc/uc_09_notifications.md`、`docs/prd.md`
- 主要原因：2026-02-27 起通知優先序調整為「匯出行事曆通知」優先，Email 通知改列未來項目。

# 低優先工作清單（Low Priority Backlog）

> 本清單收錄「暫時結案、非 MVP 阻塞、後續有餘裕再重啟」的工作項目。

## 項目

1. Local Magic Link 登入穩定性（Auth）
- 狀態：暫時結案（待重啟）
- 詳細文件：`docs/future_works/magic_link_local_auth.md`
- 主要原因：本機 loopback host 與 callback 後 session/cookie 判定在特定開發路徑下仍不穩定，需獨立時段做端到端重現與收斂。

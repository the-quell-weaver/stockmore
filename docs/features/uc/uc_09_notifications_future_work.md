# UC-09 Future Work: Notifications（Email 到期提醒 / 低庫存提醒）
- **Doc**: docs/features/uc/uc_09_notifications_future_work.md
- **Source**: 自 `docs/features/uc/uc_09_notifications.md` 於 2026-02-27 拆分
- **Status**: Backlog

本文件保留 UC-09 中「非行事曆匯出」的後續規格，供未來迭代恢復實作。

## 1. Future Scope
- 行事曆訂閱 feed URL（可持續同步）
- Email 到期提醒（依 offset 30/7/1 天）
- 低庫存 Email 提醒（每日頻率上限）
- 通知設定（enable_expiry_email / enable_low_stock_email）
- 排程 job（掃描、寄送、失敗重試）
- 寄送去重與稽核紀錄（notification_deliveries）

## 2. Data Model（future）
- `notification_settings`
  - `org_id`, `warehouse_id`
  - `enable_expiry_email`, `enable_low_stock_email`
  - `created_at/by`, `updated_at/by`
- `notification_deliveries`
  - `org_id`, `warehouse_id`
  - `type` (`expiry` / `low_stock`)
  - `dedupe_key`（unique）
  - `status` (`sent` / `failed` / `skipped`)
  - `sent_at`, `error_message`, `payload_summary`

## 3. Rules（future）
- 到期提醒：同一 batch + 同一 offset 只寄一次。
- 低庫存提醒：同一 org/warehouse 每日最多一封。
- 去重依 DB unique constraint 實作，避免併發重複寄送。

## 4. Jobs（future）
- 以 cron 週期執行，使用 service role。
- 查詢仍需明確限制 org/warehouse 範圍。
- 建議流程：`insert pending -> send -> update sent/failed`。

## 5. API（future）
- `GET /api/calendar/expiry/feed`（或等價訂閱端點）
- `getNotificationSettings()`
- `updateNotificationSettings(patch)`
- `POST /api/jobs/notifications/run`

## 6. Acceptance（future）
- 啟用到期提醒且命中 offset 時寄出 1 封 Email。
- dedupe_key 已存在時不重複寄送。
- 低庫存在同日不超過 1 封。
- viewer 修改設定應被拒絕（FORBIDDEN）。

## 7. Notes
- 本文件為 backlog 參考；目前優先交付請以
  `docs/features/uc/uc_09_notifications.md`（行事曆匯出）為準。

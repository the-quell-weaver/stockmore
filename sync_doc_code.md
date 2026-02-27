# Spec ↔ Code 同步盤點（docs/features/current vs codebase）

更新時間：2026-02-27
狀態：**已納入決議版**（可直接作為後續實作計畫輸入）

## 判讀範圍
- 規格：`docs/features/current/*.md`
- 程式：`src/`（server actions、service、route、UI）
- 目的：列出不相符項目，並明確標示「本次決議」與後續執行方向。

## 決議總覽（TL;DR）
1. **Items 的 `minStock`、`note` 不納入 MVP 必要欄位**：此差異改由**更新規格**處理，不修改現有 UI/action。  
2. **MVP 採單標籤**（Item 預設標籤、Batch 標籤都為單一）。多標籤移入 Future Works。  
3. `listConsumableBatches`、`listStockBatches` cursor response、以及部分 action 回傳包裝格式：**先改規格對齊現況**。  
4. UC-01 magic link 實作位置：**改規格**，註明目前為 client 直連 Supabase Auth。  
5. UC-07 `idempotencyKey`：**改 code**，調整流程補上必填與對應驗證。  
6. pagination（cursor-based）列為**低優先 Future Works**。

---

## 不相符清單與決議

| # | 不相符項目 | 現況（code） | 決議 | 後續動作類型 |
|---|---|---|---|---|
| 1 | UC-02 文件描述可維護 `minStock`、`note` | `createItemAction` 固定 `minStock: 0` 且未接收 `note`；`updateItemAction` 也未送 `minStock`、`note` | **以規格為準調整：MVP 不要求此兩欄可編輯** | 更新規格 |
| 2 | UC-02 `defaultTagIds`（複數）語意 | DB 與 service 目前為單一 `default_tag_id`，僅取 `defaultTagIds?.[0]` | **MVP 固定單標籤**，文件改為單數語意；多標籤移 Future Works | 更新規格 + Future Works |
| 3 | UC-04 容易被解讀為多標籤 | `batches.tag_id` 單值，stock view 顯示單一 `tagName` | **MVP 固定單標籤**，文件明確「每個 batch 僅 1 tag」 | 更新規格 + Future Works |
| 4 | UC-06 文件列出 `listConsumableBatches(query?)` | 程式中無此 API | **先改規格對齊現況**（不補此 API） | 更新規格 |
| 5 | UC-08 文件描述 `{ batches, nextCursor? }` | 目前僅回傳陣列，cursor 未落地 | **短期改規格為暫無 cursor**；cursor pagination 移 Future Works（低優先） | 更新規格 + Future Works |
| 6 | 多份 current 文件採「物件包裝回傳」 | 多數 route/service 實際為直接陣列 | **先改規格對齊現況** | 更新規格 |
| 7 | UC-01 文件有 `requestMagicLink` server action | 現為 client 端呼叫 `signInWithOtp` | **改規格註明實作位置** | 更新規格 |
| 8 | UC-07 將 `idempotencyKey` 寫成必填但 code 非必填 | `adjustBatchQuantity` validation/action 允許缺省 | **改 code，補齊必填** | 修改程式碼 |

---

## 可直接拆任務的實作計畫（Execution Plan）

> 目標：讓拿到此文件的人可直接建立 issue / milestone / PR checklist。

### Track A — 規格同步（高優先，先做）

#### A1. 更新 UC-02（Items）
- 將 current state 改為：MVP 階段 `minStock`、`note` 非主要可編輯欄位（或標記為保留欄位/暫未暴露 UI）。
- API/action 描述改成目前實作實際可用參數與行為。
- 驗收：文件不再要求 UI 可維護 `minStock`、`note`。

#### A2. 更新 UC-02 / UC-04（單標籤語意）
- `defaultTagIds`（複數）改為單數語意（例如 `defaultTagId`）。
- UC-04 明確寫「每個 batch 僅能關聯 1 個 tag」。
- 驗收：文件讀者不會再推論多標籤已在 MVP 上線。

#### A3. 更新 UC-06 / UC-08 / 其他 current 文件 API 契約
- 移除或註記 `listConsumableBatches`（目前未提供）。
- UC-08 改為：`listStockBatches` 當前回傳陣列，暫無 cursor-based pagination。
- 將不符合現況的 `{ items: [...] }` 這類包裝回傳改為實際 payload。
- 驗收：文件 API 介面可直接對照現有 route/service 無歧義。

#### A4. 更新 UC-01（magic link 實作位置）
- 補註：目前由 client 直連 Supabase Auth（`signInWithOtp`），非 server action。
- 驗收：Auth 流程描述與程式架構一致。

---

### Track B — 程式修正（中高優先）

#### B1. UC-07 調整流程強制 `idempotencyKey`
- 修改 validation：`adjustBatchQuantity` 將 `idempotencyKey` 改為必填，缺少時回傳一致錯誤碼。
- 修改 action/UI：送出調整時必定帶入 key（目前頁面已有 hidden input，可補 server 端強制驗證）。
- 更新/新增測試：
  - unit：validation 在缺少 key 時失敗；有 key 時通過。
  - integration：調整交易重送行為符合預期（同 key 去重或衝突語意一致）。
- 驗收：與 UC-07 規格一致（idempotencyKey 必填）。

---

### Track C — Future Works（不阻塞當前 MVP）

1. **多標籤模型**（Item/batch）
   - 可能需 schema 由單值關聯改為 join table。
   - 涉及 UI（多選器）、查詢、交易寫入與 RLS 範圍檢視。
   - 優先度：中低。

2. **Stock View cursor-based pagination**
   - 需定義 cursor 編碼規則、排序穩定鍵、前後端契約、e2e 驗證。
   - 優先度：低。

---

## 建議執行順序
1. 先完成 **Track A（文件同步）**，避免持續以錯誤契約開發。  
2. 再做 **Track B（idempotencyKey 必填）**，確保交易安全性一致。  
3. 最後把 **Track C** 建成 backlog（epic + 子任務），不阻塞 MVP 收斂。

## 交付物建議（給 PM / Tech Lead）
- 依 Track A/B/C 建立 issue 標籤：`spec-sync`、`mvp-hardening`、`future-work`。
- 將 B1 設為近期 PR（含測試），A 系列可在同週內由文件 PR 完成。
- Future Works 僅立項不承諾近期排程。

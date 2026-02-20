# CI 測試擴充指引（何時、如何修改 `.github/workflows/ci.yml`）

> 目的：目前 CI 為了避免「專案尚未建立測試檔」而使用 `--passWithNoTests` / `--pass-with-no-tests`。當團隊開始正式導入測試時，請依本文件調整 CI，讓測試真正成為 merge gate。

---

## 1) 什麼情況代表「應該升級 CI」

當以下任一條件成立，就不應再讓 CI 忽略空測試：

1. 已新增第一批 `unit` 或 `integration` 測試檔。
2. 已建立 `playwright` e2e 測試案例。
3. 團隊希望 PR 沒有執行到任何測試時要直接失敗（防止漏跑）。

---

## 2) 建議先完成的前置工作

在修改 workflow 前，先在 `src/package.json` 建立明確 scripts：

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "test:integration": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

> 為什麼要改成 scripts：
> - 讓本機與 CI 指令一致（開發者用同一套命令）。
> - 後續要加參數（coverage、reporter、test project）更容易管理。

---

## 3) CI 應修改的重點

請在 `.github/workflows/ci.yml` 做以下調整：

### A. Typecheck

- 現況：`npx tsc --noEmit`
- 可改為：`npm run typecheck`

### B. Vitest（unit / integration）

- 現況：`npx -y vitest run --passWithNoTests`
- 正式化後請改為：
  - `npm run test:unit`
  - `npm run test:integration`
- **移除** `--passWithNoTests`，避免測試檔遺失卻誤判成功。

### C. Playwright E2E

- 現況：`npx -y playwright test --pass-with-no-tests`
- 正式化後請改為：`npm run test:e2e`
- **移除** `--pass-with-no-tests`，確保 e2e 為實際 gate。

---

## 4) 參考範例（可直接套用）

以下為 `ci.yml` 的「測試相關段落」建議寫法：

```yaml
- name: Typecheck
  working-directory: src
  run: npm run typecheck

- name: Vitest unit
  working-directory: src
  run: npm run test:unit

- name: Vitest integration
  working-directory: src
  run: npm run test:integration

- name: Build Next.js app
  working-directory: src
  run: npm run build

- name: Install Playwright browsers
  working-directory: src
  run: npx playwright install --with-deps chromium

- name: Run Playwright E2E
  working-directory: src
  env:
    PLAYWRIGHT_BASE_URL: http://127.0.0.1:5566
  run: |
    npm run start -- -p 5566 &
    APP_PID=$!
    trap "kill $APP_PID" EXIT

    for i in {1..30}; do
      if curl -fsS http://127.0.0.1:5566 >/dev/null; then
        break
      fi
      sleep 1
    done

    npm run test:e2e
```

---

## 5) 實務建議（避免常見踩雷）

1. **先本機跑過再改 CI**：
   - `npm run typecheck`
   - `npm run test:unit`
   - `npm run test:integration`
   - `npm run build`
   - `npm run test:e2e`
2. **unit / integration 建議分 project 或目錄**：避免互相污染資料。
3. **若 integration 依賴 Supabase local**：沿用 CI 內 `supabase start` + `supabase db reset`。
4. **e2e 測試資料要可重建、可清理**：避免測試偶發失敗（flaky）。
5. **不要把 `--passWithNoTests` 永久保留**：它只適合「測試剛起步」過渡期。

---

## 6) 建議的升級時機（里程碑）

- M1：有第一個 unit test → 移除 unit 的 `--passWithNoTests`。
- M2：有第一個 integration test → 移除 integration 的 `--passWithNoTests`。
- M3：有第一個 Playwright scenario → 移除 e2e 的 `--pass-with-no-tests`。
- M4：測試穩定後，可再增加 coverage 門檻與測試報告上傳。

---

## 7) 與本專案現況對齊

目前 `.github/workflows/ci.yml` 已包含：
- `pull_request` 觸發
- install / lint / typecheck
- `supabase start` + `supabase db reset`
- Vitest unit + integration
- `next build` + `next start -p 5566`
- Playwright e2e

本文件只定義「何時從過渡模式（允許空測試）切換到正式 gate 模式」。

# 簽到前

工讀生／臨時工簽到單的送件前檢查工具。DOCX、照片、OCR 文字與檢查結果都只在使用者瀏覽器處理；線上資料庫只保存不含個資的計畫規則。

## 本機執行（兩台 Mac 共用原始碼）

原始碼、`package.json`、`package-lock.json` 由 iCloud 共用；`node_modules` 必須留在每台 Mac 的 `~/.local/`，專案原位只放 symlink。**不要直接在這個 iCloud 專案目錄跑 `npm install` 或 `npm ci`**：npm 11 會移除 symlink，重新把大量小檔裝回 iCloud。

開始修改前先取得協作鎖；討論與唯讀 review 可以同時，專案內任何實質寫入（包含 code、README、設定、測試、`package.json`、lockfile）都必須單線：

```bash
PY="$HOME/.local/venvs/scripts-venv/bin/python3"
ROOT="$HOME/Library/Mobile Documents/com~apple~CloudDocs/AI agent/Claude"
HOLDER="" # 必須依執行端填入 claude-mini、claude-mbp 或 codex-mbp
: "${HOLDER:?尚未設定正確的 HOLDER}"
"$PY" "$ROOT/scripts/agent_lock.py" acquire signin-checker "$HOLDER" "修改內容"
sleep 5
"$PY" "$ROOT/scripts/agent_lock.py" status signin-checker
```

holder 依執行端使用 `claude-mini`、`claude-mbp` 或 `codex-mbp`。等待 5 秒後必須確認自己仍是持有者；工作超過 20 分鐘要重新 acquire 刷新，結束立即 release。另一台若同步到新的 `package-lock.json`，先更新該機本機依賴再測試；不要沿用舊 `node_modules`。

本機依賴的安全更新方式如下；npm 只在本機 project root 執行。若 alias 檢查失敗，代表該機尚未完成一次性兩層 symlink 建置，先依 `000_Agent/agent-dialogue/handoff.md` 最新 signin-checker 段處理，不得覆蓋既有路徑：

```bash
LOCAL_PROJECT="$HOME/.local/node-projects/signin-checker"
LOCAL_ALIAS="$HOME/.local/node_modules/signin-checker"
test "$(readlink "$LOCAL_ALIAS")" = "$LOCAL_PROJECT/node_modules" || exit 1
cp -p package.json package-lock.json "$LOCAL_PROJECT/"
npm ci --prefix "$LOCAL_PROJECT"
```

建置或更新後的日常測試指令是：

```bash
npm test
npm run dev
```

完成所有寫入與驗證後釋放鎖：

```bash
"$PY" "$ROOT/scripts/agent_lock.py" release signin-checker "$HOLDER"
```

瀏覽器端到端測試另需本機 Chrome：

```bash
npm run qa
QA_DOCX_PATH="/完整路徑/測試簽到單.docx" QA_EXPECTED_ROWS=15 npm run qa
npm run qa:ocr
```

未指定文件時會產生不含個資的測試 DOCX。Chrome 不在 macOS 預設位置時，可另外設定 `QA_CHROME_PATH`。

未設定 Supabase 時，管理頁會使用瀏覽器 `localStorage`。這適合本機測試，但只影響同一個瀏覽器。

## 啟用跨裝置規則管理

1. 建立 Supabase 專案。
2. 在 Supabase SQL Editor 執行 [`supabase/schema.sql`](./supabase/schema.sql)。
3. 在 Authentication 建立唯一管理者帳號，並關閉公開註冊。
4. 複製 `.env.example` 為 `.env`，填入專案 URL 與公開 anon key。
5. GitHub Pages 部署時，在 repository variables 建立 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`。
6. 登入管理頁，儲存第一個計畫規則。

Supabase service role key 不得放入前端、`.env` 或 GitHub Pages 變數。

## 隱私界線

- 不上傳：DOCX、照片、姓名、學號、電話、簽名、OCR 文字、檢查結果。
- 線上保存：計畫名稱、計畫編號、執行單位、時薪、允許日期／時段、地點規則與工作內容規則。
- 地點規則可切換校內限制，並設定必要文字（例如「研究室」）、房號、禁止關鍵字與範例文字。
- 下載的檢查清單預設不含個資與原始辨識內容。

## 基本工時依據

- [勞動基準法第 30 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=30&id=FL014930)：正常工時每日 8 小時、每週 40 小時。
- [勞動基準法第 35 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=35&id=FL014930)：繼續工作 4 小時後至少休息 30 分鐘；法定例外仍須人工判斷。
- 專案日期、地點、時段與工作內容限制依校內表單及管理頁設定，不視為一般法規規則。

## 已知限制

- 照片 OCR 對手寫內容與歪斜、陰影照片可能不準（結果頁會顯示辨識信心提醒），檢查前必須人工確認；Word 檔檢查最可靠。
- 文件對不到任何啟用中的計畫時會直接提示重新確認計畫編號；只有一個啟用計畫時仍會以該計畫檢查並標出不一致欄位。
- 頁尾親筆簽名依「簽名／立切結書人」等字樣尋找；表單沒有這類字樣時改為提醒人工確認。
- 每週 40 小時只計算目前文件；其他計畫與其他簽到單需人工確認。
- 第一版以中原大學現行簽到單欄位為主。
- 工具提供送件前提醒，不代表校方核准或法律意見。

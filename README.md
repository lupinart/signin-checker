# 簽到前

工讀生／臨時工簽到單的送件前檢查工具（Word 檔專用）。DOCX 與檢查結果都只在使用者瀏覽器處理；計畫規則存放在 repo 的 `public/rules.json`，由管理頁透過 GitHub Token 直接 commit 更新。

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
```

未指定文件時會產生不含個資的測試 DOCX。Chrome 不在 macOS 預設位置時，可另外設定 `QA_CHROME_PATH`。

管理頁未連接 GitHub Token 時是本機模式（存瀏覽器 `localStorage`），適合測試但只影響同一個瀏覽器。

## 啟用跨裝置規則管理（GitHub Token）

1. GitHub 右上頭像 → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。
2. Repository access 選 **Only select repositories**，只勾 `signin-checker`。
3. Permissions → Repository permissions → **Contents** 設為 **Read and write**，其餘維持 No access。
4. 產生後複製 Token，貼進管理頁的「連接 GitHub」欄位。
5. 之後在管理頁儲存規則，會自動 commit 到 `public/rules.json`，GitHub Pages 重新部署後（約 1~2 分鐘）所有學生生效；每次修改都有 git 紀錄可回溯。

Token 只存在管理者自己的瀏覽器 `localStorage`；到期（最長一年）後重新產生一個貼上即可。

## 隱私界線

- 不上傳：DOCX、姓名、學號、電話、簽名、檢查結果。
- 公開保存於 repo：計畫名稱、計畫編號、執行單位、時薪、允許日期／時段、地點規則與工作內容規則（`public/rules.json`，不含任何個資）。
- 地點規則可切換校內限制，並設定必要文字（例如「研究室」）、房號、禁止關鍵字與範例文字。

## 基本工時依據

- [勞動基準法第 30 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=30&id=FL014930)：正常工時每日 8 小時、每週 40 小時。
- [勞動基準法第 35 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=35&id=FL014930)：繼續工作 4 小時後至少休息 30 分鐘；法定例外仍須人工判斷。
- 專案日期、地點、時段與工作內容限制依校內表單及管理頁設定，不視為一般法規規則。

## 已知限制

- 僅支援 Word（DOCX）檔；手寫簽名在列印後才會存在，由「人工檢查不可省略」提醒清單涵蓋，工具不檢查照片。
- 文件對不到任何啟用中的計畫時會直接提示重新確認計畫編號；只有一個啟用計畫時仍會以該計畫檢查並標出不一致欄位。
- 簽章與頁尾簽名不會被當成錯誤：Word 檔裡打字的簽名會提醒「須列印後手寫」，空白則由人工提醒清單涵蓋。
- 每週 40 小時只計算目前文件；其他計畫與其他簽到單需人工確認。
- 第一版以中原大學現行簽到單欄位為主。
- 工具提供送件前提醒，不代表校方核准或法律意見。

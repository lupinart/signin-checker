# 簽到前

工讀生／臨時工簽到單的送件前檢查工具。DOCX、照片、OCR 文字與檢查結果都只在使用者瀏覽器處理；線上資料庫只保存不含個資的計畫規則。

## 本機執行

```bash
npm install
npm test
npm run dev
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

- 照片 OCR 對手寫內容與歪斜、陰影照片可能不準（已內建放大與對比前處理、辨識信心提示），檢查前必須人工確認。
- 文件對不到任何啟用中的計畫時會直接提示重新確認計畫編號；只有一個啟用計畫時仍會以該計畫檢查並標出不一致欄位。
- 頁尾親筆簽名依「簽名／立切結書人」等字樣尋找；表單沒有這類字樣時改為提醒人工確認。
- 每週 40 小時只計算目前文件；其他計畫與其他簽到單需人工確認。
- 第一版以中原大學現行簽到單欄位為主。
- 工具提供送件前提醒，不代表校方核准或法律意見。

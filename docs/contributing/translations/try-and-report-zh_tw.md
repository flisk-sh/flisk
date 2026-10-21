# 試用並回報你看到的內容

> 本頁是 [try-and-report.md](../try-and-report.md) 的翻譯。如有差異，以英文版為準。

你不需要撰寫程式碼，也不需要寫出精緻的 bug 報告。本頁說明如何安裝 Flisk、執行一個範例，並透過一份簡短的表單告訴我們發生了什麼。粗略的筆記也沒關係：一份附有真實數據、尚未完成的報告，比沒有報告更有幫助。

[開啟表單](https://github.com/flisk-sh/flisk/issues/new?template=try-it-and-report.yml)。它有三個簡短的必填問題（你嘗試了什麼、過程如何、你看到了什麼），其餘都是選填。

## 1. 安裝

你需要執行中的 Docker（Desktop、OrbStack 或 Colima），以及 Tilt 0.25.0 或更新版本。然後安裝 Flisk CLI：

```bash
curl -fsSL https://raw.githubusercontent.com/flisk-sh/flisk/main/install.sh | sh
flisk --version
```

將 `flisk --version` 的輸出複製到表單的 "Your setup" 欄位中。如果安裝失敗，這本身也是一份有用的報告：請貼上錯誤訊息並說明你的作業系統。

## 2. 取得範例

```bash
git clone https://github.com/flisk-sh/flisk.git
cd flisk/examples/one-backend-python
```

這個範例是一個 FastAPI 服務。完整說明請參閱它自己的 [README](../../../examples/one-backend-python/README.md)。

## 3. 執行它

```bash
flisk project --yes
time flisk up one-backend-python
```

只有在所有服務都就緒時，`flisk up` 才會印出 `Flisk is up.`，因此 `time` 印出的 `real` 那一行，就是你的首次啟動時間，包括映像檔建置和相依套件安裝。檢查服務是否回應：

```bash
curl --fail http://api.one-backend-python.localhost/api/api-backend/health
# {"status":"ok","service":"api-backend"}
```

如果 80 埠被佔用，Flisk 會選擇另一個埠。`flisk doctor --json` 會顯示實際使用的是哪一個。

如果出現任何失敗，請執行 `flisk status` 和 `flisk doctor`，並貼上它們印出的內容。使用 `flisk down` 停止所有服務。

## 4. 選用：我們缺少的計時數據

這三個數字是 [issue 683](https://github.com/flisk-sh/flisk/issues/683) 正在等待的資料。你可以依照自己的意願完成任意數量的測量，並說明你跳過了哪些。

**首次啟動。** 第 3 步中 `time flisk up` 的結果。

**熱啟動。** 停止服務後再重新啟動。映像檔已經建置好了，所以這次應該更快：

```bash
flisk down
time flisk up one-backend-python
```

**儲存到就緒。** 修改一行，測量服務回應該變更所需的時間。我們修改 `/health` 回傳的單字 `ok`。範例 README 說明目前每次編輯都會重新建置映像檔，因此預計需要幾秒，而不是毫秒。這正是我們想看到的數字：

```bash
now() { perl -MTime::HiRes=time -e 'printf "%.1f", time'; }
f=services/one-backend-python/api/src/main.py
perl -pi -e 's/"status": "ok"/"status": "changed"/' "$f"
start=$(now)
until curl -fs http://api.one-backend-python.localhost/api/api-backend/health | grep -q changed; do sleep 0.2; done
echo "save to ready: $(perl -e "printf '%.1f', $(now) - $start") s"
git checkout -- "$f"   # 復原編輯
```

**與 `uvicorn --reload` 比較。** 在不使用 Flisk 的情況下執行同樣的改動，以便了解其中的差距（如果有的話）。這需要 Python 3.12 或更新版本。先執行 `flisk down`，讓兩者不會爭搶 CPU，並將虛擬環境放在專案之外：

```bash
cd services/one-backend-python/api
python3 -m venv /tmp/uvicorn-venv && . /tmp/uvicorn-venv/bin/activate
pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0"
uvicorn main:app --app-dir src --port 4000 --reload
```

在第二個終端機中，使用 `http://localhost:4000/health` 取代 `.localhost` 網址，從範例資料夾重複一次「儲存到就緒」的步驟。完成後按 Ctrl-C 停止。

如果 issue 中關於 Postgres 的部分對你很重要，也請記錄 API 在 Postgres 啟動期間記錄的任何連線錯誤。`flisk logs` 會顯示它們。

## 5. 填寫表單

開啟[表單](https://github.com/flisk-sh/flisk/issues/new?template=try-it-and-report.yml)，用你自己的話回答。以下是兩個有用報告的範例（數字為虛構，僅供說明）：

**運作正常，附有數字**

| 欄位 | 範例 |
|---|---|
| 你嘗試了什麼？ | 執行 examples/one-backend-python 並計時 |
| 過程如何？ | 可以運作，但某些地方很慢或很奇怪 |
| 你看到了什麼？ | 首次 `flisk up` 4 分 10 秒。熱啟動 `flisk up` 35 秒。儲存到就緒：Flisk 約 6 秒，`uvicorn --reload` 約 1 秒。 |
| Your setup | macOS 15、OrbStack、flisk 1.3.126 |

**失敗了**

| 欄位 | 範例 |
|---|---|
| 你嘗試了什麼？ | 在全新複製的儲存庫中執行 `flisk up one-backend-python` |
| 過程如何？ | 失敗了 |
| 你看到了什麼？ | 約 2 分鐘後停止，顯示 `✗ api-backend failed`。`flisk status` 將其顯示為錯誤。 |
| 貼上的輸出 | `flisk up` 和 `flisk status` 印出的文字 |
| Your setup | WSL2 中的 Ubuntu 24.04、Docker Desktop、flisk 1.3.126 |

以下內容能讓報告更容易處理，但都不是必要的：

- 說明這是首次執行還是重複執行。
- 貼上文字而不是截圖，這樣我們可以搜尋。
- 從你貼上的任何內容中移除密碼和權杖。
- 如果你有預期，請說明你預期的結果是什麼。

我們的目標是在一個工作日內於 issue 中回覆。如果你想更進一步、刻意尋找 bug，請參閱 [在 Flisk 中尋找 bug](../finding-bugs.md)。

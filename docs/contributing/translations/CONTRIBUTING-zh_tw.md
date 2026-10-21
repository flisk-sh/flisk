# 為 Flisk 做出貢獻

[English](../../../CONTRIBUTING.md) | [简体中文](CONTRIBUTING-zh_cn.md) | 繁體中文 | [日本語](CONTRIBUTING-ja.md) | [한국어](CONTRIBUTING-ko.md)

> 本頁是 [CONTRIBUTING.md](../../../CONTRIBUTING.md) 的翻譯。如有不一致，以英文版為準。連結的指南目前只有英文版。

歡迎！小修正和大功能都很有價值。先從簡短的[貢獻者指南](../README.md)開始：它會帶你完成找到要改的內容、動手修改、檢查結果，以及提交 pull request 的整個流程。

## 從這裡開始

1. [選擇你的變更並準備好儲存庫](../01-first-change.md)。
2. [依照對應類型的變更步驟操作](../02-feature-recipes.md)。
3. [檢查你的工作並提交 pull request](../03-open-a-pr.md)。
4. [審查別人的 pull request](../04-review-a-pr.md)，可使用一鍵 AI 審查按鈕。

[前端 provider 指南](../../frontend-framework-providers.md)提供新增 Vue 等其他 Vite 框架的具體步驟。[後端 provider 指南](../../backend-language-providers.md)說明如何新增 Python 等後端語言。

## 快速設定

你需要 Git、[Bun](https://bun.sh) 和 Node.js 22.12+。大多數變更不需要 Docker 和 Tilt。

```bash
git clone https://github.com/flisk-sh/tdk-cli-core.git
cd tdk-cli-core
bun install
bun run typecheck && bun run lint && bun run test   # 約一分鐘；在你修改任何東西之前，這些都應該通過
```

如果在全新的 checkout 上其中某一步失敗，那是專案的 bug，不是你的環境問題：請[提交 issue](https://github.com/flisk-sh/tdk-cli-core/issues/new/choose)。

## 尋找 bug

不寫程式碼也能幫忙。執行一個指令，把它的輸出與 Flisk 的承諾（它的 `--help`、文件或另一個指令）比較，並回報任何差異。那就是 bug。

[在 Flisk 中尋找 bug](../finding-bugs.md) 有具體步驟：用來測試的暫存專案、附有預期輸出的指令清單、過去找到 bug 的模式，以及維護者可以直接處理的回報格式。例如，如果 `flisk networks` 沒有列出任何 URL，而 `flisk up --dry-run` 卻印出了它們，代表兩個指令不一致，其中一個是錯的。

## 審查 pull request

不寫程式碼也可以透過審查開放中的 [pull request](https://github.com/flisk-sh/tdk-cli-core/pulls) 來幫忙。每個 PR 結尾都有 **Grok**、**Claude** 和 **Codex** 按鈕，點擊後會開啟一個已經請求審查該 PR 的 AI 對話。AI 是你的助手：請對照 diff 核實它說的內容，然後在 GitHub 上以 **Comment**、**Approve** 或 **Request changes** 提交你自己的審查。

第一次審查之前，請閱讀[必讀文件](../04-review-a-pr.md#before-your-first-review-required-reading)（大約一小時，只需一次）。接著 [審查 pull request](../04-review-a-pr.md) 會一步步說明這些按鈕，並提供核准和要求修改時的留言範例。

## 尋找可以做的事

- 🗺️ [Flisk 之旅](../../journey/README.md)：選擇一座島嶼，完成任務，提升段位（8 kyu → 1 dan）
- [Good first issues](https://github.com/flisk-sh/tdk-cli-core/labels/good%20first%20issue)
- [Help wanted](https://github.com/flisk-sh/tdk-cli-core/labels/help%20wanted)
- 使用逐步清單[尋找 bug](../finding-bugs.md)
- [回報 bug 或提問](https://github.com/flisk-sh/tdk-cli-core/issues/new/choose)

如果你選了一個 issue，請留言 `I'll take this`（或 `I would like this one`、`I'd like to work on this`、`Can I take this?`）。機器人會把它指派給你並加上 `claimed` 標籤，避免兩個人做同樣的工作。認領後 14 天沒有 pull request 會收到提醒，21 天後會被釋出；草稿 PR 也算是進度。回報 bug 時，請盡量附上 `flisk doctor` 的輸出。

## 拼字檢查

使用 `cargo install typos-cli --version 1.50.3` 安裝固定版本的檢查工具，然後在儲存庫根目錄執行 `typos` 檢查拼字。

## 標籤

用標籤找到符合你興趣和經驗的工作。維護者會在分類時加上標籤；issue 表單和 PR labeler 也會自動加上一些標籤。線上的[標籤清單](https://github.com/flisk-sh/tdk-cli-core/labels)包含每個標籤的說明。

| 標籤 | 意義 | 何時加上 |
| --- | --- | --- |
| `bug` | 某些功能沒有如預期運作。 | bug 回報表單和已確認的缺陷。 |
| `enhancement` | 新功能或改進。 | 功能請求表單和已接受的改進。 |
| `documentation` | 缺漏、錯誤或不清楚的文件。 | 文件表單和文件工作。 |
| `good first issue` | 小而獨立、幾乎不需要了解儲存庫的任務。 | 維護者認為適合作為第一次貢獻。 |
| `help wanted` | 需要社群協助的任務，通常比 first issue 更大。 | 維護者歡迎有人接手。 |
| `difficulty: easy`、`difficulty: medium`、`difficulty: hard` | 幾小時、一兩天，或需要深入了解儲存庫或進行設計的工作。 | 維護者估計任務難度；與貢獻者標籤互相補充。 |
| `question` | 請求釐清。 | 維護者把它當作問題而不是實作任務來分類。 |
| `duplicate` | 已有其他 issue 或 PR 涵蓋該工作。 | 維護者會連結原始討論。 |
| `invalid`、`wontfix` | 無效的回報，或專案不會做的工作。 | 維護者會說明為什麼不繼續。 |
| `premium` | Premium 授權請求和付費功能。 | premium issue 表單或維護者分類。 |
| `tracking` | 包含相關任務的總括 issue。 | 維護者把跨多個 issue 的工作歸在一起。 |
| `community`、`examples`、`growth` | 社群工作、範例專案或推廣改進。 | 維護者識別推廣和採用相關任務。 |
| `dx`、`design`、`guide` | 開發者體驗、視覺或 UX 打磨，或書面指南。 | 維護者識別改進的類型。 |
| `testing`、`ci`、`packaging` | 測試、GitHub Actions，或安裝程式和套件。 | 維護者識別驗證和交付工作。 |
| `agents` | 給 AI 程式設計代理使用的文件和檔案。 | 維護者識別面向代理的工作。 |
| `rfc` | 實作之前的設計討論。 | 維護者要求先就提案範圍達成共識。 |
| `windows` | Windows 和 WSL2 支援。 | 維護者識別特定平台的工作。 |
| `performance`、`benchmark` | 速度或記憶體改進，或量測工具。 | 維護者識別最佳化和量測工作。 |
| `hacktoberfest` | 參加 Hacktoberfest 的工作。 | 維護者選擇符合活動資格的貢獻。 |
| `area:*` | 受影響的部分，例如 `area: tui`、`area: doctor` 或 `area: cli`。 | 維護者為 issue 加標籤；PR labeler 根據變更路徑推斷區域。 |
| `tech:*` | 相關技術，例如 TypeScript、Docker 或 Tilt。 | 維護者識別任務涉及的工具。 |
| `rank:*`、`island:*` | Flisk 之旅中的任務規模和主題。 | 維護者把任務放到貢獻者地圖上。 |
| `event:*` | 針對特定活動的工作，例如 GitHub Universe。 | 維護者安排特定活動的工作。 |

## 簽署你的 commit

每個 commit 都需要 [Developer Certificate of Origin](../../../DCO) 簽署。使用 `git commit -s` 加上，它會附加 `Signed-off-by: Your Name <you@example.com>`。要修正既有的 commit，請執行 `git rebase --signoff origin/main` 並強制推送你的分支。如果某個 commit 缺少這一行，pull request 檢查會失敗。

## 把你的團隊加入採用者清單

在你自己的儲存庫中使用 Flisk？你可以透過兩種方式被列入 [ADOPTERS.md](../../../ADOPTERS.md)：開啟 [We use Flisk](https://github.com/flisk-sh/tdk-cli-core/issues/new?template=we-use-flisk.yml) issue 表單，或在 pull request 中向表格新增一列。[What counts](../../../ADOPTERS.md#what-counts) 說明了應該連結什麼，以及什麼不算。

## 治理

請參閱 [GOVERNANCE.md](../../../GOVERNANCE.md) 了解如何做出決定以及如何新增維護者，[MAINTAINERS.md](../../../MAINTAINERS.md) 了解誰可以合併，[ADOPTERS.md](../../../ADOPTERS.md) 了解哪些團隊在使用 Flisk。

## 友善待人

參與即表示你同意遵守[行為準則](../../../CODE_OF_CONDUCT.md)。請使用 [SECURITY.md](../../../SECURITY.md) 私下回報安全問題，不要在公開 issue 中回報。

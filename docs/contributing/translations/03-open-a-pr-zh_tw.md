# 3. 檢查你的改動並提交 pull request

> 本頁是 [03-open-a-pr.md](../03-open-a-pr.md) 的翻譯。如有差異，以英文版為準。

## 執行與你的改動相關的檢查

除非指令另有說明，請在儲存庫根目錄執行檢查。

| 改動 | 需要執行的檢查 |
|---|---|
| CLI 程式碼或產生的 CLI 行為 | `bun run typecheck`、`bun run lint`、`bun run test` |
| CLI 測試使用的引擎/Starlark 產生器 | 執行 `bun run typecheck`、`bun run lint`，以及 `cd cli && TDK_REQUIRE_TILT=1 npm test`。CI 測試工作會安裝 Tilt 並設定此旗標。 |
| Python 引擎測試區域 | 執行一次 `python3 -m pip install -r tests/requirements.txt` 安裝測試套件，然後用 `pytest` 執行相關測試檔案，或使用 `make test-tilt-engine` 執行該套件。其中部分測試在乾淨的 checkout 上也會失敗；哪些測試、為什麼失敗，請參閱 #700。這些 Python 檢查不會由 `.github/workflows/ci.yml` 執行。 |
| 僅文件 | 檢查你修改過的連結和指令；以新手的角度完整讀過一次頁面。 |

除非你確實執行過某項檢查，否則不要說它已通過。如果無法執行某項檢查，請說明原因。

### 如果 golden 輸出測試失敗

三個範例專案產生的 Tilt 和 Compose 檔案，會與 `cli/src/generator/__tests__/golden/` 中已提交的副本比對。如果你是刻意修改了 `cli/templates/` 中的範本或產生器，測試會失敗，並列出每個有變動的檔案。執行 `UPDATE_GOLDEN=1 bun run test -- golden-generated-output` 接受變更，閱讀 golden 檔案的差異，並與你的改動一起提交。如果你並非刻意改變產生的輸出，請修正原因，而不是更新這些檔案。現有專案也會看到相同的位元組變化，因此在它們下次執行 `tdk config regenerate` 之前，`tdk config verify` 會回報不同步；請在 PR 中說明這一點。

## 展示改動內容

對於錯誤修正或行為改動，如果可以，請在 `main` 和你的分支上執行相同的步驟。貼上真實的前後輸出，不要憑記憶重建。包括指令、專案或測試夾具，以及重現所需的任何設定。涵蓋 issue 中提到的空狀態、錯誤狀態或復原狀態。

如果你要測試建置後的 CLI 進入點，請先執行 `bun run build`，以免使用舊的編譯檔案。在真實的終端機中檢查 `tdk ui` 等互動式指令。如果缺少自動化測試，請說明原因，並連結一個用於新增測試的 issue。新的行為和錯誤修正需要在同一個 pull request 中包含測試；請參閱 [CONTRIBUTING.md 中的測試](../../../CONTRIBUTING.md#tests)。

## 推送你的分支

如果你對儲存庫有寫入權限：

```bash
git add path/to/your/files
git commit -m "Describe the change"
git push -u origin my-change
```

如果你是從 fork 貢獻，請推送到你的 fork，然後從該分支開啟 pull request。

## 開啟 pull request

前往 GitHub 上的儲存庫。點擊你分支的 **Compare & pull request**，或選擇 **Pull requests → New pull request**。選擇 `main` 作為目標分支，然後填寫：

```markdown
## What changed
<!-- One or two sentences. Link the issue with Fixes #123 when applicable. -->

## How I checked it
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] Other check: ...

## Evidence
<!-- Paste useful output or show before/after behavior. Say what you did not check. -->
```

刪除不適用的檢查清單項目。如果有助於審閱者理解改動，請加入截圖或真實的終端機輸出。切勿包含密碼、權杖、私人 URL 或個人檔案路徑。

## 在點擊「Create pull request」之前

- [ ] PR 只做一件主要的事。
- [ ] 我已連結 issue，或說明了該改動為何有用。
- [ ] 我已更新受改動影響的文件或範例。
- [ ] 我列出了實際執行過的檢查，並說明了任何缺漏。
- [ ] 如果行為有改變，我提供了前後對比的證據。

開啟 PR 後，GitHub 會執行 CI。如果某項檢查失敗，請閱讀其日誌，在同一分支上修正後重新推送，PR 會自動更新。然後回覆審閱者在 PR 上提出的問題。

GitHub 也會在你的 PR 描述末尾加上 **Grok**、**Claude** 和 **Codex** 按鈕。點擊其中一個，就能在別人查看前取得 AI 對你自己 PR 的審查。[審查 pull request](04-review-a-pr-zh_tw.md) 說明了這些按鈕的運作方式，以及審閱者如何核准或要求修改。

## GitHub 執行的內容

[PR 範本](../../../.github/pull_request_template.md)會要求你選取改動的領域，並展開每個領域的簡短說明。GitHub 也會根據變更的路徑加上對應的 `area:*` 標籤，並在你推送更新的 diff 時移除過時的領域標籤。標籤用來整理 PR；哪些自動化會執行，則由工作流程的路徑規則決定。

- **每個 pull request：** [CI](../../../.github/workflows/ci.yml) 會執行 lint、typecheck、CLI 測試和套件冒煙檢查。部分額外的 CI 工作取決於改動了哪些檔案或儲存庫設定。
- **執行階段檔案有變更：** 當 PR 修改了 `cli/`、`engine/` 或 `discovery/` 下的檔案，或修改了 `Tiltfile`、`package.json` 或該工作流程檔案時，Quickstart E2E 也會執行。
- **框架範例：** 新增 Vue、React 或其他 provider 會改動 `cli/` 和 `engine/`，因此始終執行的 CI 和 Quickstart E2E 都會執行。
- **僅文件改動：** 始終執行的 CI 仍會執行。除非 PR 同時修改了 Quickstart E2E 所列的路徑之一，否則 Quickstart E2E 不會執行。

其他範例應用程式以及 100 個服務的夾具基準檢查，是依排程或手動請求執行，而非每個 PR 都執行。你可以在 `.github/workflows/` 中每個工作流程檔案的頂部查看其觸發路徑。

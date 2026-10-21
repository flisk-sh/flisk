# 第一次為 Flisk 貢獻

[English](../README.md) | [简体中文](README-zh_cn.md) | 繁體中文 | [日本語](README-ja.md) | [한국어](README-ko.md)

> 本頁是 [docs/contributing/README.md](../README.md) 的翻譯。如有差異，以英文版為準。

你不需要了解整個儲存庫。選一個小改動，依照對應的指南操作；如果某一步不清楚，可以在 issue 中提問。

<p align="center">
  <img src="../assets/contribution-path.svg" alt="四個步驟：找到任務、做一個改動、檢查、提交 pull request" width="720" />
</p>

## 選擇最接近的項目

| 我想…… | 從這裡開始 |
|---|---|
| 修正 CLI 指令或新增選項 | [CLI 指南](02-feature-recipes-zh_tw.md#修改-cli-指令) |
| 新增 Vue 之類的前端框架 | [前端 provider 指南](../../frontend-framework-providers.md) |
| 新增資料庫或基礎設施工具 | [資料庫與工具指南](02-feature-recipes-zh_tw.md#新增資料庫或基礎設施工具) |
| 修改 Flisk 探索服務或產生設定的方式 | [引擎與探索指南](02-feature-recipes-zh_tw.md#修改引擎或服務探索) |
| 修正文字、連結或拼字 | [文件指南](02-feature-recipes-zh_tw.md#修改文件) |
| 不需要程式碼，試用 Flisk 或範例並告訴我們結果 | [試用並回報](try-and-report-zh_tw.md) |
| 不需要程式碼，尋找並回報 bug | [尋找 bug](../finding-bugs.md) |
| 審查別人的 pull request | [審查 PR](04-review-a-pr-zh_tw.md) |

## 完整流程

1. [準備儲存庫](01-first-change-zh_tw.md)。
2. 做一個聚焦的改動。遇到困難可以尋求協助。
3. 執行與你的改動相符的檢查。指南會說明需要哪些檢查。
4. [提交 pull request](03-open-a-pr-zh_tw.md)，並說明你檢查過的內容。
5. [審查其他 pull request](04-review-a-pr-zh_tw.md)。每個 PR 上的 AI 按鈕可以提供第一輪審查。

**不確定程式碼在哪裡？** 在儲存庫中搜尋你看到的指令、設定鍵、產生的檔名或服務名稱，然後找到它的測試。仍然不確定的話，請先開一個 issue 再進行大型改動。

**要修改面向使用者的契約或 Flisk 的多個部分？** 撰寫程式前先遵循 [OpenSpec 指南](01-first-change-zh_tw.md#何時撰寫變更提案)。小的拼字和文件修正不需要提案。

## 需要協助？

請寫明你嘗試了什麼、預期什麼、實際發生了什麼，然後[開一個 issue](https://github.com/flisk-sh/flisk/issues/new/choose)。提問前不必先解決問題。

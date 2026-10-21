# 1. 準備進行改動

> 本頁是 [01-first-change.md](../01-first-change.md) 的翻譯。如有差異，以英文版為準。

你不需要了解整個儲存庫。選一個小改動，依照對應的指南操作。如果某一步不清楚，請在 issue 中提問。

以下步驟只需做一次，用於安裝 Flisk CLI 及其檢查所需的工具。

## 最快的方式：Dev Container / Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/flisk-sh/flisk?quickstart=1)
[![Open in Dev Containers](https://img.shields.io/badge/Open%20in-Dev%20Containers-blue?logo=visualstudiocode)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/flisk-sh/flisk)
[![Open in Gitpod](https://img.shields.io/badge/Open%20in-Gitpod-908a00?logo=gitpod)](https://gitpod.io/#https://github.com/flisk-sh/flisk)
[![Open in Firebase Studio](https://img.shields.io/badge/Open%20in-Firebase%20Studio-4285F4?logo=firebase)](https://idx.google.com/import?url=https://github.com/flisk-sh/flisk)
[![Open in Replit](https://img.shields.io/badge/Open%20in-Replit-F26207?logo=replit)](https://replit.com/github/flisk-sh/flisk)
[![Open in DevPod](https://img.shields.io/badge/Open%20in-DevPod-1C1C1C?logo=devpod)](https://devpod.sh/open#https://github.com/flisk-sh/flisk)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-1269D3?logo=stackblitz)](https://stackblitz.com/github/flisk-sh/flisk)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-151515?logo=codesandbox)](https://codesandbox.io/p/github/flisk-sh/flisk)

或者複製儲存庫後，在 VS Code 中使用 **Dev Containers: Reopen in Container**。

預設容器提供 Node.js 22 和 Bun，並會自動執行 `bun install`。啟動後可以直接執行：

```bash
bun run typecheck
bun run lint
bun run test
```

Docker 和 Tilt 是選用的，不包含在預設容器中。只有需要執行 Flisk 服務或完整的本機環境時才需要新增。

## 需要準備的內容（本機安裝）

- Git
- [Bun](https://bun.sh)
- Node.js 22.12 或更新版本
- 僅當需要執行 Flisk 服務或檢查完整本機環境時，才需要 Docker 和 [Tilt](https://docs.tilt.dev/install.html)

## 將儲存庫複製到你的電腦

開啟終端機並執行：

```bash
git clone https://github.com/flisk-sh/flisk.git
cd flisk
bun install
git switch -c my-change
```

把 `my-change` 換成簡短的名稱，例如 `docs-new-framework-guide`。

## 找到一個改動

1. 開啟 [good first issues](https://github.com/flisk-sh/flisk/labels/good%20first%20issue) 或 [help wanted issues](https://github.com/flisk-sh/flisk/labels/help%20wanted)。
2. 閱讀 issue，確認是否已有人在處理。
3. 留言 `I'll take this`（或 `I would like this one`）；機器人會指派你為負責人並加上 `claimed` 標籤。如果還沒有 issue，在開始較大的功能前，先開一個描述該改動的 issue。
4. 使用[功能指南](02-feature-recipes-zh_tw.md)找出可能需要修改的檔案和檢查項目。

## 何時撰寫變更提案

當改動影響面向使用者的契約、manifest 或產生格式，或涉及多個子系統時，請使用 OpenSpec。[Vue provider 變更](../../../openspec/changes/archive/2026-09-28-add-vue-frontend-adapter/proposal.md)是一個已完成的範例，包含 proposal、design、specs 和 tasks。如果你的電腦上沒有安裝 `openspec` 指令，請在開始跨領域的改動前先在 issue 中詢問。

在儲存庫根目錄執行：

```bash
openspec list
openspec new change "short-change-name"
openspec status --change "short-change-name"
```

依照 OpenSpec 印出的說明建立適用的 proposal、design、specs 和 tasks。拼字修正、連結修正或小型獨立的改動通常不需要提案。

## 執行快速檢查

在儲存庫根目錄中，CLI 的檢查指令為：

```bash
bun run typecheck
bun run lint
bun run test
```

在最後一次編輯後再次執行檢查。如果某項檢查失敗，請把失敗訊息附在 PR 中，並說明你嘗試過什麼。各領域的檢查請參閱 [PR 指南](03-open-a-pr-zh_tw.md)。

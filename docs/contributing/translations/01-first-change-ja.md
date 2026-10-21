# 1. 最初の変更を準備する

> このページは [01-first-change.md](../01-first-change.md) の翻訳です。内容が異なる場合は英語版が優先されます。

このリポジトリ全体を理解する必要はありません。小さな変更を一つ選び、対応するレシピに従ってください。手順が分からなければ、issue で質問してください。

以下の手順は一度だけ行えば十分です。TDK CLI とそのチェックに必要なツールを用意します。

## 最速の方法: Dev Container / Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/flisk-sh/tdk-cli-core?quickstart=1)
[![Open in Dev Containers](https://img.shields.io/badge/Open%20in-Dev%20Containers-blue?logo=visualstudiocode)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/flisk-sh/tdk-cli-core)
[![Open in Gitpod](https://img.shields.io/badge/Open%20in-Gitpod-908a00?logo=gitpod)](https://gitpod.io/#https://github.com/flisk-sh/tdk-cli-core)
[![Open in Firebase Studio](https://img.shields.io/badge/Open%20in-Firebase%20Studio-4285F4?logo=firebase)](https://idx.google.com/import?url=https://github.com/flisk-sh/tdk-cli-core)
[![Open in Replit](https://img.shields.io/badge/Open%20in-Replit-F26207?logo=replit)](https://replit.com/github/flisk-sh/tdk-cli-core)
[![Open in DevPod](https://img.shields.io/badge/Open%20in-DevPod-1C1C1C?logo=devpod)](https://devpod.sh/open#https://github.com/flisk-sh/tdk-cli-core)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-1269D3?logo=stackblitz)](https://stackblitz.com/github/flisk-sh/tdk-cli-core)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-151515?logo=codesandbox)](https://codesandbox.io/p/github/flisk-sh/tdk-cli-core)

または、リポジトリをクローンして VS Code で **Dev Containers: Reopen in Container** を実行してください。

デフォルトのコンテナには Node.js 22 と Bun が入っており、起動後に `bun install` を自動で実行します。起動後すぐに次を実行できます。

```bash
bun run typecheck
bun run lint
bun run test
```

Docker と Tilt は任意で、デフォルトのコンテナには含まれていません。TDK のサービスや完全なローカル環境を動かす必要がある場合にのみ追加してください。

## 必要なもの（ローカルへのインストール）

- Git
- [Bun](https://bun.sh)
- Node.js 22.12 以降
- TDK のサービスを動かす、またはローカル環境全体を確認する必要がある場合のみ、Docker と [Tilt](https://docs.tilt.dev/install.html)

## リポジトリを自分のコンピューターにコピーする

ターミナルを開いて次を実行します。

```bash
git clone https://github.com/flisk-sh/tdk-cli-core.git
cd tdk-cli-core
bun install
git switch -c my-change
```

`my-change` は短い名前に置き換えてください。例: `docs-new-framework-guide`。

## 変更を一つ見つける

1. [good first issue](https://github.com/flisk-sh/tdk-cli-core/labels/good%20first%20issue) または [help wanted の issue](https://github.com/flisk-sh/tdk-cli-core/labels/help%20wanted) を開く。
2. issue を読み、すでに誰かが取り組んでいないか確認する。
3. `I'll take this`（または `I would like this one`）とコメントする。bot があなたを担当者に設定し、`claimed` ラベルを付けます。issue がない場合は、大きな機能を始める前に変更内容を説明する issue を開いてください。
4. [機能レシピ](02-feature-recipes-ja.md)を使って、変更しそうなファイルとチェックを探す。

## 変更提案を書くべきとき

ユーザーに見える仕様、manifest や生成フォーマット、または複数のサブシステムに影響する変更には OpenSpec を使います。[Vue provider の変更](../../../openspec/changes/archive/2026-09-28-add-vue-frontend-adapter/proposal.md)は、proposal、design、specs、tasks をそろえた完了済みの例です。お使いのマシンに `openspec` コマンドがインストールされていない場合は、横断的な変更を始める前に issue で相談してください。

リポジトリのルートで次を実行します。

```bash
openspec list
openspec new change "short-change-name"
openspec status --change "short-change-name"
```

OpenSpec が表示する手順に従って、必要な proposal、design、specs、tasks を作成してください。タイプミスの修正、リンクの修正、小さく独立した変更であれば、通常は提案は不要です。

## 簡単なチェックを実行する

リポジトリのルートで、CLI のチェックは次のとおりです。

```bash
bun run typecheck
bun run lint
bun run test
```

最後の編集のあとにもう一度チェックを実行してください。失敗した場合は、その出力を PR に含め、何を試したかを書いてください。領域ごとのチェックは [PR のガイド](03-open-a-pr-ja.md)を参照してください。

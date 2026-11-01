# コントリビューター向けクイックスタート

[English](../quick-start.md) | 日本語

> このページは [docs/contributing/quick-start.md](../quick-start.md) の翻訳です。内容が異なる場合は英語版が優先されます。

リポジトリをクローンして最初のテストが通り、プルリクエストを作成するまで、わずか5分ほどで完了します。詳しい手順は [最初の変更を準備する](01-first-change-ja.md) を参照してください。

## まずは挨拶してみましょう

[Flisk Discord](https://discord.gg/Sjhb3tnq3) に参加して、どんな作業に取り組みたいか教えてください。メンテナーが最初のタスク選びをお手伝いし、開発環境を整える際に出てくる疑問にもお答えします。

## 1. 必要なもの

- [Git](https://git-scm.com/)
- [Bun](https://bun.sh)
- [Node.js](https://nodejs.org/) 22.12 以降
- [Docker](https://docs.docker.com/get-docker/) と [Tilt](https://docs.tilt.dev/install.html)（完全なローカルスタックを起動する場合のみ必要です。ほとんどの変更作業では必要ありません）

## 2. クローンとインストール

GitHub でリポジトリをフォークしてから、次を実行します。

```bash
git clone https://github.com/<your-username>/flisk.git
cd flisk
bun install
git switch -c my-change
```

## 3. テストを実行する

```bash
npm --prefix cli test
```

CI では、Docker と Tilt が利用できる Linux 環境でこのコマンドを実行します。Docker や Tilt が利用できない環境では、スタックの起動や状態確認を行う一部のテストが失敗することがあります。自分の変更が原因だと判断する前に、`main` ブランチでの最新の CI 実行結果と比較してください。

## 4. リンターを実行する

```bash
npm --prefix cli run lint
```

## 5. CLI をビルドする

```bash
npm --prefix cli run build
```

## 6. ビルドした CLI を実行してみる

```bash
node cli/bin/flisk.js --help
```

## 7. 開発環境を確認する

```bash
node cli/bin/flisk.js doctor
```

`doctor` コマンドは、Docker、Tilt、その他の実行に必要なコンポーネントが利用できる状態かどうかを確認します。環境への変更は一切行いません。CLI の開発だけを行う場合は、Docker や Tilt のチェックが失敗しても問題ありません。

`node cli/bin/flisk.js demo` コマンドは、単なるプレビューではなく、デモ環境一式をワンコマンドで起動するものです。デモ用プロジェクトを `~/.flisk/flisk-demo` にクローンし、`flisk` をグローバルインストールしたうえで、スタックを起動します。Docker と Tilt のセットアップが完了してから実行してください。

## 8. 変更を行う

ファイルを編集したら、手順3〜5のチェックをもう一度実行します。次のように [DCO](../../../.github/CONTRIBUTING.md) のサインオフを付けてコミットします。

```bash
git add path/to/your/files
git commit -s -m "docs: describe the change"
```

`-s` オプションを指定すると、プルリクエストのチェックで必要となる `Signed-off-by:` 行がコミットメッセージに自動的に追加されます。

## 9. プルリクエストを作成する

```bash
git push -u origin my-change
```

GitHub で、自分のブランチから `main` ブランチに向けてプルリクエストを作成し、説明欄に `Fixes #<issue-number>` と記載してください。プルリクエストのテンプレートと、CI で実行されるチェックについては [変更内容を確認してプルリクエストを作成する](03-open-a-pr-ja.md) を参照してください。

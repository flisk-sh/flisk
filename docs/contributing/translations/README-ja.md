# Flisk への最初のコントリビュート

[English](../README.md) | 日本語

> このページは [docs/contributing/README.md](../README.md) の翻訳です。内容が異なる場合は英語版が優先されます。

コードベース全体を理解する必要はありません。小さな変更を一つ選び、対応するレシピに従ってください。途中で分からないことがあれば、issue で質問してください。

<p align="center">
  <img src="../assets/contribution-path.svg" alt="4つのステップ: 作業を見つける、変更を一つ行う、確認する、pull request を作成する" width="720" />
</p>

## 近いものを選ぶ

| やりたいこと | ここから始める |
|---|---|
| CLI コマンドの修正やオプションの追加 | [CLI レシピ](02-feature-recipes-ja.md#cli-コマンドを変更する) |
| Vue のようなフロントエンドフレームワークの追加 | [フロントエンド provider ガイド](../../frontend-framework-providers.md) |
| データベースやインフラツールの追加 | [データベース・ツールのレシピ](02-feature-recipes-ja.md#データベースやインフラツールを追加する) |
| Flisk によるサービスの検出や設定生成の変更 | [エンジンと検出のレシピ](02-feature-recipes-ja.md#エンジンやサービス検出を変更する) |
| 文言、リンク、誤字の修正 | [ドキュメントのレシピ](02-feature-recipes-ja.md#ドキュメントを変更する) |
| コードなしで Flisk や例を試し、結果を報告する | [試して報告する](try-and-report-ja.md) |
| コードなしでバグを探して報告する | [Flisk でバグを見つける](finding-bugs-ja.md) |
| 他の人の pull request をレビューする | [pull request をレビューする](04-review-a-pr-ja.md) |

## 全体の流れ

1. [リポジトリを準備する](01-first-change-ja.md)。
2. 焦点を絞った変更を一つ行う。行き詰まったら助けを求める。
3. 変更に合ったチェックを実行する。どのチェックかはレシピに書かれています。
4. [pull request を作成する](03-open-a-pr-ja.md)、そして確認した内容を説明する。
5. [ほかの pull request をレビューする](04-review-a-pr-ja.md)。すべての PR にある AI ボタンが最初のレビューを手伝います。

**どこにコードがあるか分からない？** コマンド、設定キー、生成されるファイル名、サービス名をリポジトリ内で検索してください。そのテストも探してみてください。それでも分からなければ、issue を開いて、大きな変更を始める前に相談してください。

**ユーザーに見える仕様や、Flisk の複数の部分を変更する？** コーディングの前に [OpenSpec ガイド](01-first-change-ja.md#変更提案を書くべきとき)に従ってください。タイプミスや小さなドキュメント修正には提案は不要です。

## 助けが必要？

試したこと、期待したこと、実際に起きたことを書いて、[issue を作成](https://github.com/flisk-sh/tdk-cli-core/issues/new/choose)してください。質問する前に問題を解決しておく必要はありません。

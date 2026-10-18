# 3. 変更を確認して pull request を作成する

> このページは [03-open-a-pr.md](../03-open-a-pr.md) の翻訳です。内容が異なる場合は英語版が優先されます。

## 変更に対するチェックを実行する

特に指定がない限り、リポジトリのルートでチェックを実行してください。

| 変更内容 | 実行するチェック |
|---|---|
| CLI のコード、または生成される CLI の動作 | `bun run typecheck`、`bun run lint`、`bun run test` |
| CLI のテストで使われるエンジン/Starlark の生成器 | `bun run typecheck`、`bun run lint`、`cd cli && TDK_REQUIRE_TILT=1 npm test` を実行してください。CI のテストジョブは Tilt をインストールし、このフラグを設定します。 |
| Python エンジンのテスト領域 | 一度だけ `python3 -m pip install -r tests/requirements.txt` でテストパッケージをインストールし、関連するテストファイルを `pytest` で実行するか、そのスイートでは `make test-tilt-engine` を実行してください。一部のテストはクリーンなチェックアウトでも失敗します。どれがなぜ失敗するかは #700 を参照してください。これらの Python のチェックは `.github/workflows/ci.yml` では実行されません。 |
| ドキュメントのみ | 変更したリンクとコマンドを確認する。ページを初めて読む人の目線で一度通して読む。 |

実際に実行していないチェックを「成功した」とは言わないでください。チェックを実行できない場合は、その旨と理由を書いてください。

### ゴールデン出力のテストが失敗した場合

`cli/templates/` の生成される Tilt と Compose ファイルは、3つのサンプルプロジェクトについて `cli/src/generator/__tests__/golden/` にコミットされたコピーと照合されます。テンプレートや生成器を意図的に変更した場合、テストは失敗し、変わったファイルの名前が表示されます。`UPDATE_GOLDEN=1 bun run test -- golden-generated-output` を実行して変更を受け入れ、golden ファイルの差分を読んで、変更と一緒にコミットしてください。意図せず生成される出力が変わった場合は、ファイルを更新するのではなく原因を直してください。既存のプロジェクトも同じバイト列の変化を受けるため、次回の `tdk config regenerate` まで `tdk config verify` が不一致を報告します。その点は PR に書いてください。

## 変更内容を示す

バグ修正や動作の変更では、可能なら `main` と自分のブランチで同じ手順を実行してください。実際の前後の出力を貼り付けてください。記憶から再現しないでください。コマンド、プロジェクトまたはフィクスチャ、再現に必要なセットアップを含めます。issue に書かれた空の状態、エラーの状態、リカバリーの状態も確認してください。

ビルド済みの CLI エントリーポイントをテストする場合は、古いコンパイル済みファイルを使わないように、先に `bun run build` を実行してください。`tdk ui` のような対話型コマンドは、実際のターミナルで確認してください。自動テストがない場合は、その理由を書き、テストを追加する issue をリンクしてください。新しい動作やバグ修正には、同じ pull request にテストが必要です。詳しくは [CONTRIBUTING.md のテスト](../../../CONTRIBUTING.md#tests)を参照してください。

## ブランチを push する

リポジトリへの書き込み権限がある場合:

```bash
git add path/to/your/files
git commit -m "Describe the change"
git push -u origin my-change
```

フォークから貢献する場合は、フォークに push してから、そのブランチから pull request を開いてください。

## pull request を開く

GitHub のリポジトリに移動します。ブランチの **Compare & pull request** をクリックするか、**Pull requests → New pull request** を選びます。ベースブランチとして `main` を選んで、次を記入してください。

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

該当しないチェック項目は削除してください。レビューする人が変更を理解する助けになる場合は、スクリーンショットや実際のターミナルの出力を追加してください。パスワード、トークン、非公開の URL、個人のファイルパスは決して含めないでください。

## 「Create pull request」をクリックする前に

- [ ] PR は一つの主要な作業だけを行っている。
- [ ] issue をリンクした、またはその変更が有用な理由を説明した。
- [ ] 変更の影響を受けるドキュメントや例を更新した。
- [ ] 実際に実行したチェックを列挙し、不足している点を書いた。
- [ ] 動作が変わった場合、前後の証拠を含めた。

PR を開くと GitHub が CI を実行します。チェックが失敗したら、そのログを読み、同じブランチで修正して push し直してください。PR は自動的に更新されます。その後、レビューする人の質問に PR で答えてください。

GitHub は PR の説明の末尾に **Grok**、**Claude**、**Codex** のボタンも追加します。どれかをクリックすると、他の人が見る前に自分の PR について AI レビューを受けられます。[pull request をレビューする](04-review-a-pr-ja.md)では、ボタンの仕組みと、レビューする人が承認や変更依頼をする方法を説明しています。

## GitHub が実行するもの

[PR テンプレート](../../../.github/pull_request_template.md)では、変更した領域を選ぶよう求められ、領域ごとの短い説明が開きます。GitHub は変更されたパスに基づいて対応する `area:*` ラベルも追加し、更新された差分を push すると古い領域ラベルを削除します。ラベルは PR を整理するためのもので、どの自動処理が実行されるかは、ワークフローのパスのルールが決めます。

- **すべての pull request:** [CI](../../../.github/workflows/ci.yml) が lint、typecheck、CLI のテスト、パッケージのスモークチェックを実行します。追加の CI ジョブは、変更されたファイルやリポジトリの設定によって実行されることがあります。
- **実行時のファイルが変更された:** PR が `cli/`、`engine/`、`discovery/` 配下のファイル、または `Tiltfile`、`package.json`、そのワークフローファイルを変更すると、Quickstart E2E も実行されます。
- **フレームワークの例:** Vue、React、その他の provider を追加すると `cli/` と `engine/` が変わるため、常に実行される CI と Quickstart E2E の両方が実行されます。
- **ドキュメントのみの変更:** 常に実行される CI は実行されます。Quickstart E2E は、PR が一覧に載ったパスのいずれかを変更していない限り実行されません。

その他のサンプルアプリや 100 サービスのフィクスチャのベンチマークは、各 PR ではなく、スケジュールまたは手動の要求で実行されます。各ワークフローのトリガーのパスは、`.github/workflows/` 内のファイルの先頭に書かれています。

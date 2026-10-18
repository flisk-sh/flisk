# 2. 変更に合ったレシピに従う

> このページは [02-feature-recipes.md](../02-feature-recipes.md) の翻訳です。内容が異なる場合は英語版が優先されます。

これらのレシピは出発点です。ファイルが見つからない場合は、コマンド、設定キー、生成されるファイル名をリポジトリ内で検索し、issue で質問してください。

## CLI コマンドを変更する

1. `cli/src/commands/` の下でコマンドを探す。
2. そのテストを `cli/src/commands/__tests__/` の下、またはソースファイルの隣で探す。
3. issue を修正する、またはオプションを追加するのに必要最小限の変更を行う。
4. コマンドやそのオプションがユーザーに見える場合は `cli/README.md` を更新する。
5. リポジトリのルートで `bun run typecheck`、`bun run lint`、`bun run test` を実行する。

フロントエンドフレームワークの場合は、専用の[フロントエンド provider ガイド](../../frontend-framework-providers.md)に従ってください。React/Vue の provider の境界、エンジンのテンプレート、互換性チェック、PR のチェックリストが説明されています。

## データベースやインフラツールを追加する

まず、何を追加するのかを決めてください。

- **サービスが使うデータベース**は、サービスの manifest、データベース URL の生成、マイグレーションの設定、readiness チェックに影響する可能性があります。
- **共有のローカルツール**（例: Redis や NATS）は、オプション機能の設定、生成される Compose ファイル、Tilt のリソース登録、依存関係、ヘルスチェックに影響する可能性があります。

既存のコードを地図として使ってください。

1. `engine/topologies/tilt/resources/infra-loader.star` から、共有インフラがどう読み込まれ、登録されるかを確認する。
2. データベースのライフサイクルの例として `engine/topologies/tilt/resources/databases.star` を、Compose の生成として `engine/topologies/platform/docker/compose/` を見る。
3. 関連する機能や manifest の設定を見つけ、それが検証され、有効になる場所まで追う。`rg` で設定名を検索してください。
4. 設定、生成されるファイル、起動順序、ヘルス・readiness、環境変数やシークレット、シャットダウンとクリーンアップ、ツールを無効にしたときの動作まで、ライフサイクル全体を追う。
5. 変更した動作のチェックを追加する。CLI と Starlark の生成器のテストは `cli/src/commands/__tests__/` にあり、Python エンジンのテストは `tests/tilt-engine/` にあります。
6. `docs/FEATURES.md` や `cli/README.md` など、ユーザー向けの機能や CLI のドキュメントを更新する。

新しいツールにこれらのファイルすべてが必要だとは限りません。自分の機能に最も近い既存の実装に従い、共有サービスの動作を壊さないようにしてください。

## Docker なしで Starlark の変更を試す

Tilt だけがインストールされていれば、どのエンジン関数でも実行して出力を確認できます。リポジトリのルートで `try.Tiltfile` を作成してください（git の管理対象外です）。

```python
load("engine/topologies/platform/docker/compose/compose.star", "generate_backend_compose_entry")

manifest = {"appType": "backend", "stack": "shop", "port": 4000, "appName": "orders-api"}
resource = {"name": "orders-api", "_resource_path": "services/shop/orders-api"}
manifest["_resource_path"] = resource["_resource_path"]

entry = generate_backend_compose_entry("services/shop", "orders-api", resource, manifest)
fail("OUTPUT\n" + entry)  # fail() は Tiltfile で文字列を表示する方法です（Docker は不要）
```

```bash
tilt alpha tiltfile-result -f try.Tiltfile
```

生成された Compose エントリは `Error in fail: OUTPUT` の後に表示されます。`load()` のパスは Tiltfile からの相対パスなので、ファイルはリポジトリのルートに置いてください。manifest を変更してもう一度実行し、結果を比べてください。同じ考え方で、`cli/src/commands/__tests__/`（例: `stack-routers.test.ts`）の Starlark テストが生成器の出力を確認しています。テストを追加するときは、そのどれかをコピーしてください。

## エンジンやサービス検出を変更する

1. Tilt のリソースのオーケストレーションは `engine/topologies/tilt/resources/` から始める。
2. Docker、ネットワーキング、永続化された状態は `engine/topologies/platform/` から始める。
3. manifest のスキャンと依存グラフは `discovery/` から始める。
4. 影響を受ける出力ファイルや manifest のフィールドを検索して、その生成器とテストを見つける。CLI のテストには Starlark の生成器のチェックが含まれています。
5. 既存の manifest と生成されたプロジェクトがまだ動くかを確認する。動作が変わったら、スキーマ、例、CLI のドキュメントを更新する。
6. 変更が契約や複数のモジュールにまたがる場合は、先に [OpenSpec の提案](01-first-change-ja.md#変更提案を書くべきとき)を書く。

`engine/AGENTS.md` などの `AGENTS.md` ファイルは、エージェント向けの作業メモです。ローカルのコードを説明する助けにはなりますが、プロダクトのドキュメントとして使う前に、そのパスとアドバイスを現在のソースとテストで確認してください。

## ドキュメントを変更する

1. 最も近い既存のページを見つけて、それを更新する。別のコピーを作らない。
2. 短い見出し、番号付きの手順、そのままコピーできるコマンドを使う。
3. 編集したファイルからの相対リンクを確認する。
4. 関係するチェックだけを実行する。ドキュメントだけの変更では、変更したリンクとコマンドを確認すれば十分です。CLI のテストスイートを実行する必要はありません。

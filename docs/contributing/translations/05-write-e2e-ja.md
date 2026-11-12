# 5. エンドツーエンドテストを作成する

> このページは [05-write-e2e.md](../05-write-e2e.md) の翻訳です。内容が異なる場合は英語版が優先されます。

エンドツーエンド（e2e）テストでは、本物の `flisk` を、Docker、Tilt、Traefik、生成されたファイルといった本物のスタックに対して実行します。ユニットテストでは、壊れたルートや、いつまでも準備完了にならないコンテナ、実際のエラーによってスタックトレースに化けてしまう JSON エンベロープは検出できません。e2e テストなら検出できます。

このページでは、e2e テストが必要な場面、配置場所、作成方法、および動作することを実証する方法について説明します。全体を通して、[エージェントスイート](../../../tests/e2e/resource-types/agent/run.sh) を実例として使用しています。AI アシスタントは、`flisk-e2e-author` スキル（`.claude/skills/flisk-e2e-author/`）を使用して、同じ手順を実行できます。

## e2e テストは必要ですか？

以下の変更を行う場合は、e2e テストを追加または拡張してください：

- リソースタイプを追加する、またはタイプがスキャフォールドする内容や実行方法を変更する。
- 実行中のスタックとやり取りするコマンドや MCP ツールを追加する（`flisk agent sessions`、`flisk restart`、`agent_sessions`）。
- `flisk up`、`flisk down`、Traefik ルーティング、またはエンジンが生成する Compose と Tilt のファイルを変更する。
- バックエンド言語、バックエンドやフロントエンドのフレームワーク、そのほかユーザーがフラグで選ぶ provider を追加する。

スタックを一切起動しない変更、たとえばフラグのパース、モック入力での `--json` フォーマット、ジェネレーターのテキスト出力などには、e2e テストは**不要**です。それらは `cli/src/**/__tests__/` 配下のユニットテストに属します。スタックを起動せずに、一時的なプロジェクトに対して CLI をサブプロセスとして呼び出すテスト（`*-e2e.test.ts` ファイル）は `cli-integration` グループであり、vitest に残ります。

## グループを選ぶ

稼働中のスタックを使うスイートはすべて `tests/e2e/<group>/<suite>/` に置かれ、属するグループは、何を実証するかでちょうど1つに決まります：

| グループ | 実証すること | 例 |
|---|---|---|
| `resource-types` | 1 つのリソースタイプが実際のスタックで動作すること | `resource-types/agent` |
| `journeys` | 複数コマンドにまたがるユーザーフロー | quickstart, smoke runner, dev loop, cold start |
| `examples` | サンプルアプリが実際に起動し、各ルートに応答すること | デフォルトのサンプル、saas-starter |
| `platforms` | ホスト環境 | `platforms/windows`, `platforms/windows-binary`, `platforms/wsl2`, `platforms/windows-hardware` |
| `scale` | 大きなフィクスチャまたはベンチマーク | 100 サービスの ERP フィクスチャ |

実行中のエージェントを読み取る MCP ツールを追加しますか？そのテストは `agent` スイートに属します（MCP リソースであれば `mcp` スイート）。ケース C1〜C3 の構成を踏襲してください。

これまでに移動したのは `resource-types/agent` だけです。その他の e2e テストは `.github/workflows/*-e2e.yml`、`scripts/e2e/`、`scripts/verify-*.sh`、`tests/e2e/*.test.sh` にまだ置かれています。移動は 1 pull request につき 1 スイートずつで、[`openspec/changes/organize-e2e-suites`](../../../openspec/changes/organize-e2e-suites/tasks.md) が説明するとおりです。自分の変更がそのいずれかに関係する場合は、今ある場所で拡張するか、先に移動してください。

このガイドの残りのセクションは英語で提供されています。続きは [05-write-e2e.md](../05-write-e2e.md) を参照してください。

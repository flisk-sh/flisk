# 6. e2e スイートをマトリクスで実行する

> このページは [06-e2e-matrix.md](../06-e2e-matrix.md) の翻訳です。内容が異なる場合は英語版が優先されます。

ライブスタックのテストは GitHub Actions のマトリクスとして実行されます。各スイートが1つのレグ（leg）になり、各レグが自分のスタックを起動します。レグは並列に走るので、新しいスイートを追加しても他のスイートを待たせることはありません。このページでは、マトリクスの組み立て方、スイートをマトリクスに追加する方法、同じ方法で新しいグループのスイート群を追加する方法を説明します。ここは [テスト品質の取り組み](https://github.com/flisk-sh/flisk/issues/1388) にあるすべての e2e 項目の手本です。

手本となる例は `resource-types` グループです。これは [`e2e-resource-types.yml`](../../../.github/workflows/e2e-resource-types.yml) から実行されます。スイートの `run.sh` の書き方は、先に [e2e テストを書く](05-write-e2e-ja.md) を読んでください。

## 3 つの構成要素

```text
tests/e2e/<group>/<suite>/suite.json   one file per suite: what it is, when it runs, its timeout
tests/e2e/lib/suite-matrix.mjs         reads every suite.json in a group and prints the matrix
.github/workflows/<group>-e2e.yml      a plan job (runs the builder) and a matrix job (one leg per entry)
```

ワークフローはスイート名を一覧に持っていません。`suite.json` を持つフォルダを追加すると、その `triggers` にイベントが含まれた時点でレグが1つ追加されます。

`platforms` グループは例外です。そのワークフローはケースを一つずつ名指しで書いています。プラットフォームのスイートはスタックではなくホスト環境を検証するためです。[`platforms/windows-hardware`](../../../tests/e2e/platforms/windows-hardware/) は参照用に `windows-latest` で実行され、メンテナーがワークフローを dispatch したときは専用の Windows 11 マシン（セルフホストランナー）でも実行されます。専用のマシンを必要とするのはこのスイートだけです。[`platforms/wsl2`](../../../tests/e2e/platforms/wsl2/) は Windows ランナー上の WSL2 にある Ubuntu 24.04 ディストリビューションでケースを実行し、手動で dispatch します。その `WS6` ケースは one-command demo の流れを実行し、demo が起動したすべてのサービスが応答することを確認します。

## plan ジョブ、そしてマトリクス

ワークフローで重要なジョブは 2 つです。

1. **`plan`** はイベントからトリガー（`pr`、`nightly`、`release`、`manual`）を選び、軸を読み取り、マトリクスを JSON として `$GITHUB_OUTPUT` に出力します。
2. **グループのジョブ** は `strategy.matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}` を使い、`fail-fast: false`、`max-parallel` の上限、`timeout-minutes: ${{ matrix.timeoutMinutes }}` を指定します。

マトリクスが空（`{"include":[]}`）のとき、グループのジョブはスキップされるので、どのスイートも選ばれないトリガーでは費用がかかりません。

```bash
node tests/e2e/lib/suite-matrix.mjs resource-types,orm pr "bun,python,rust,go"
# {"include":[{"group":"languages","dir":"resource-types/backend","suite":"backend","language":"bun","label":"bun",...}, {"group":"orm","dir":"orm/prisma","label":"prisma",...}, ...]}
```

各レグは `group`（ジョブ名の前半になります）と `dir`（`run.sh` があるフォルダ、`<group>/<suite>`）を持ちます。backend スイートの言語レグは `languages` グループで実行され、ORM のスイートは `orm` グループ（`tests/e2e/orm/<suite>/`）で実行されるので、それぞれ自分の名前で表示されます（#1493）。`languages` グループは専用のフォルダを持たず、`resource-types/backend` の上にある言語の軸です。

## スイートがレグになるまで

`suite.json` には、ビルダーとワークフローが読むフィールドが入っています。

```json
{
  "group": "resource-types",
  "suite": "backend",
  "description": "What this suite proves, in one sentence.",
  "paths": ["cli/src/backend-languages/**", "tests/e2e/resource-types/backend/**"],
  "cases": ["B1", "B2", "B3"],
  "triggers": ["pr", "nightly", "release", "manual"],
  "timeoutMinutes": 25,
  "needsSecrets": []
}
```

ビルダーはスイートを次の 4 通りのいずれかでレグに展開します。

| 形 | 例 | レグ |
|---|---|---|
| 1 レグ | `agent` | 1 つ。スイート名のラベルが付く |
| 軸の値ごとに 1 つ | `backend` | `registry-axes.mjs` の言語ごとに 1 つ |
| 軸の値ごとに 1 つ（デフォルトあり） | `backend` bun | デフォルト以外の HTTP フレームワークごとに bun のレグを 1 つ追加 |
| バリアントごとに 1 つ | `bring-your-own` | `suite.json` の `variants` の項目ごとに 1 レグ。`BYO_VARIANT` にその id が設定される |

単一のレグではなく、`suite.json` に `"variants": [{"id": "..."}]` を書くと、バリアントごとのレグになります。`bring-your-own` がこの形です。`validate-suites.mjs` は知らないキーを拒否するので、綴りを確認してください。

各レグは軸の値を環境変数として受け取ります（`LANGUAGE`、`FRAMEWORK`、バリアントのスイートでは `BYO_VARIANT`）。そのためスイートの `run.sh` は必要なものだけを読みます。UI でのレグのジョブ名は `<group> / <label>`（`languages / bun`、`orm / prisma`、`resource-types / agent`）なので、レビュアーはこの名前で検索します。

## トリガーで、どこで何が走るかが決まる

| トリガー | いつ | マトリクスの対象 |
|---|---|---|
| `pr` | ワークフローの `pull_request.paths` フィルターに該当するプルリクエスト | 高速なセット: よく使われる言語 2 つ、追加のフレームワークなし |
| `nightly` | 定期実行。`latest` を npm からインストールする | グループが宣言するすべての軸の値 |
| `release` | リリースが公開された後（`workflow_run`）。直前に公開されたバージョンをインストールする | nightly と同じ |
| `manual` | `workflow_dispatch`。`version` 入力（デフォルトは `latest`）をインストールする | nightly と同じ |

バリデーターは `weekly` トリガーも受け付けますが、まだこれを実行するグループのワークフローはないので、頼らないでください。シークレットを必要とするスイートは `pr` を持てません。フォークからのプルリクエストにはシークレットが渡らないからです。`scale` スイートも `pr` を持てません。これらは `make test-shell` の中の `tests/e2e/lib/validate-suites.mjs` で検査されます。

### シークレットがないときと赤いジョブ

シークレットを必要とするジョブは、最初にチェックのステップまたはジョブを実行します。シークレットがないと、そのチェックは、シークレットの名前を含む警告とジョブのサマリーを書き、それを必要とするジョブはスキップされます。GitHub には中立的なジョブの結論がないため、スキップされたジョブが中立の結果になり、チェック自体は成功します。現在の例は、`e2e-journeys.yml` の `FLISK_LICENSE_KEY`、`publish-flisk-import.yml` の `NPM_TOKEN`、`required-checks-drift.yml` の `CI_INVENTORY_TOKEN` です。npm に公開するリリースのジョブ（`release-binaries.yml`）はスキップされません。そこではトークンがないと実行が失敗します。スキップされたリリースは成功に見えてしまうからです。

`red-job-tracker.yml` は毎日実行されます。その `TRACKED` リストにある、スケジュール実行または `main` のワークフローごとに、`main` 上の直近 3 回の実行がすべて失敗していれば、issue を 1 つ開きます。issue には最初に失敗した実行と最後のエラー行が書かれます。ジョブが赤のままの間はその issue を更新し、3 回連続で成功すると issue を閉じます。ワークフローを追加するには、そのファイル名を `scripts/red-job-tracker.mjs` の `TRACKED` に追加します。

## 既存のグループにスイートを追加する

> **真実の源が 2 つあります。** `suite.json` の `paths` は検証されますが、ビルダーもワークフローも読みません。どのプルリクエストがスイートを実行するかは、ワークフローの `pull_request.paths` フィルターが決めます。スイートを追加したり、対象を変えたりするときは、両方を更新してください。`node tests/e2e/lib/validate-suites.mjs`（`make test-shell` で実行される）は、スイートの `paths` がそのワークフローの `pull_request.paths` でカバーされていないとき、またはフィルターに、どのスイートも所有していないパスが含まれているときに失敗します（#1391）。

1. `tests/e2e/<group>/<suite>/` を作り、`run.sh`（実行可能）と `suite.json` を置きます。形は [`resource-types/backend`](../../../tests/e2e/resource-types/backend/suite.json) をコピーしてください。
2. 対象となるコードを、ワークフローの `pull_request.paths` フィルターに追加します。`pr` で実行されるスイートの `paths` のすべてがフィルターに含まれるまで、`validate-suites.mjs` のチェックは失敗します。
3. `triggers` を選びます。スイートが高速な場合だけ `["pr", "nightly", "release", "manual"]` にしてください。そうでなければ `["nightly", "release", "manual"]` を使います。
4. `make test-shell` を実行します。`validate-suites.mjs` がフォルダ、キー、そして列挙された各ケースが存在するかを確認します。
5. ビルダーをローカルで実行し、生成されるレグを確認します（上のコマンド）。

グループのワークフローがすでにあれば、ワークフローの編集は必要ありません。

## 同じ形で新しいグループを追加する

`packaging` や `failure-recovery` のような、新しい種類のテストに独自の並列実行が必要なときに使います。

1. `tests/e2e/<group>/` と、スイートごとのフォルダを、上と同じように作ります。グループ名は [e2e テストを書く](05-write-e2e-ja.md#グループを選ぶ) の表にあるものを使うか、同じ変更でその表に行を追加してください。
2. `.github/workflows/e2e-resource-types.yml` を `.github/workflows/<group>-e2e.yml` にコピーします。名前、`paths` フィルター、`concurrency` グループ、そして `plan` ジョブ内の `suite-matrix.mjs` のグループ引数を変更します。`plan` ジョブ、`fail-fast: false`、`gate` ジョブは残してください。
3. 常に実行され、plan またはいずれかのレグが失敗したときに失敗する `gate` ジョブを追加します。これはブランチ保護で必須にすべき唯一のチェックです。こうすると、スキップされたマトリクスが見逃されずに済みます。
4. `max-parallel` は、ランナーのプールが処理できる数にします（resource-types グループは 4、リリース候補は 15 を使います。リリース候補の 30 本の短いレグは、10 本ずつだと 3 波、10 分かかったためです）。
5. `e2e-resource-types.yml` が使っているのと同じ `if: failure()` のステップで、各レグの失敗時の証跡をアップロードします。

## グループのゲートと CI サマリー

すべてのプルリクエストで、3 つのグループのゲート `e2e-journeys`、`e2e-examples`、`e2e-platforms` が報告されます。これらはそれぞれ独自のワークフローにあるため、`ci.yml` の `📋 Summary` ジョブは `needs:` でそれらを待つことができません。代わりに、head コミットのチェック実行を読み、ゲートがない、または成功していない場合に失敗します。`📋 Summary` は必須チェックなので、マージをそこで止めることができます。

ゲートは、そのワークフローがトリガーされたときにだけ報告されます。そのためサマリーは、CI ワークフローが実行されたイベントで報告されるゲートだけを待ちます。

| CI のイベント | サマリーが待つゲート |
|---|---|
| `pull_request` | `e2e-journeys`、`e2e-examples`、`e2e-platforms` |
| `merge_group` | `e2e-journeys`、`e2e-examples`、`e2e-platforms` |
| main への `push` | `e2e-journeys` |
| `workflow_dispatch` | なし。`ci.yml` の dispatch では、どのゲートのワークフローも始まりません |

一覧は `scripts/e2e-gate-expectations.mjs` にあり、待機は `scripts/wait-for-e2e-gates.mjs` にあります。`scripts/e2e-gate-expectations.test.mjs` は、そのワークフローが報告できないイベントでゲートを待つように設定されていると失敗します。このルールがないと、main への push は `e2e-examples` と `e2e-platforms` を 30 分待ってから失敗します。それらは main では実行されないからです。まだ報告していないゲートも、そのワークフローがコミットに対して開始されていなければ、期限まで待たずに早々に失敗します。

## マトリクスのレグのルール

- **各レグは独立しています。** 自分のスタックを起動し、自分専用のスクラッチ用プロジェクト名を使い、`e2e_cleanup` で後片付けをします。2 つのレグが同じポートやコンテナ名を共有することは決してあってはいけません。
- **`fail-fast: false` を使います。** 1 つの言語が壊れても、他の言語の結果を隠してはいけません。
- **並列数に上限を設けます。** `max-parallel` を設定してください。Docker と Tilt のレグは重く、上限のないマトリクスはランナーを枯渇させることがあります。
- **スイートごとに `timeout-minutes` を設定します。** ワークフローに書くのではなく、`suite.json` から取ります。
- **インフラのステップだけリトライします**（イメージの取得、パッケージのインストール）。振る舞いを検証するステップは決してリトライしないでください。ケースのルールは [e2e テストを書く](05-write-e2e-ja.md) を参照してください。
- **`pr` のセットは小さく保ちます。** それ以外のすべての軸の値は `nightly`、`release`、`manual` に置いてください。プルリクエストは数分でフィードバックを得るべきです。
- **失敗時の証跡はレグの一部です。** グループのワークフローは `run.sh diagnostics` を実行し、`if: failure()` のステップで `flisk-e2e/<suite>/artifacts` をアップロードします。名前は `e2e-resource-types-<label>-<run_id>` で、14 日間保存されます。新しいグループもこのステップをコピーします。

## マトリクスをローカルで確認する

```bash
node tests/e2e/lib/suite-matrix.mjs resource-types nightly "bun,python,go" "hono,fastify" "react,vue"
node --test tests/e2e/lib/__tests__/suite-matrix.test.mjs
```

1 つ目のコマンドは、トリガーと軸の値に対して生成されるレグを表示します。2 つ目はビルダー自身のテストを実行します。

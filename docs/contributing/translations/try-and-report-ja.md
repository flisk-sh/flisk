# TDK を試して、見たことを報告する

> このページは [try-and-report.md](../try-and-report.md) の翻訳です。内容が異なる場合は英語版が優先されます。

コードを書いたり、洗練されたバグ報告を作ったりする必要はありません。このページでは、TDK をインストールし、例を実行して、短いフォームで何が起きたかを伝える方法を説明します。メモが荒削りでも構いません。実際の数値が入った未完成の報告は、何もないよりずっと役に立ちます。

[フォームを開く](https://github.com/flisk-sh/tdk-cli-core/issues/new?template=try-it-and-report.yml)。必須の回答は3つ（何を試したか、どうだったか、何を見たか）です。残りは任意です。

## 1. インストール

Docker（Desktop、OrbStack、Colima のいずれか）が起動していて、Tilt 0.25.0 以降が必要です。次に TDK CLI をインストールします。

```bash
curl -fsSL https://flisk-sh.github.io/tdk-landscape.github.io/install.sh | sh
tdk --version
```

`tdk --version` の出力を、フォームの「Your setup」欄にコピーしてください。インストールに失敗した場合、それ自体が役に立つ報告です。エラーを貼り付け、OS を書いてください。

## 2. 例を取得する

```bash
git clone https://github.com/flisk-sh/tdk-cli-core.git
cd tdk-cli-core/examples/one-backend-python
```

この例は一つの FastAPI サービスです。詳しい説明は、その [README](../../../examples/one-backend-python/README.md) にあります。

## 3. 実行する

```bash
tdk project --yes
time tdk up one-backend-python
```

`tdk up` は、すべてのサービスの準備ができたときにだけ `TDK is up.` と表示します。そのため `time` が表示する `real` の行は、イメージのビルドと依存関係のインストールを含む、初回起動の時間です。サービスが応答するか確認してください。

```bash
curl --fail http://api.one-backend-python.localhost/api/api-backend/health
# {"status":"ok","service":"api-backend"}
```

ポート 80 が使用中の場合、TDK は別のポートを選びます。`tdk doctor --json` でどのポートか分かります。

何かが失敗した場合は、`tdk status` と `tdk doctor` を実行し、その出力を貼り付けてください。すべてを停止するには `tdk down` を実行します。

## 4. 任意: 不足している計測値

以下の3つの数値は、[issue 683](https://github.com/flisk-sh/tdk-cli-core/issues/683) が待っている値です。好きなだけ計測してください。スキップしたものはその旨を書いてください。

**初回起動。** 手順 3 の `time tdk up` の結果です。

**ウォームスタート。** スタックを停止して、もう一度起動してください。イメージはすでにビルドされているので、より速くなるはずです。

```bash
tdk down
time tdk up one-backend-python
```

**保存から準備完了まで。** 1行を変更して、サービスが変更を反映して応答するまでの時間を計測してください。`/health` が返す `ok` という単語を変更します。例の README には、現在は編集のたびにイメージが再ビルドされると書かれているので、ミリ秒ではなく数秒かかると予想してください。これが私たちが知りたい数値です。

```bash
now() { perl -MTime::HiRes=time -e 'printf "%.1f", time'; }
f=services/one-backend-python/api/src/main.py
perl -pi -e 's/"status": "ok"/"status": "changed"/' "$f"
start=$(now)
until curl -fs http://api.one-backend-python.localhost/api/api-backend/health | grep -q changed; do sleep 0.2; done
echo "save to ready: $(perl -e "printf '%.1f', $(now) - $start") s"
git checkout -- "$f"   # 編集を元に戻す
```

**`uvicorn --reload` との比較。** TDK を使わずに同じ変更を実行して、差があるかどうか確認してください。これには Python 3.12 以降が必要です。二つが CPU を奪い合わないように、先に `tdk down` を実行し、仮想環境はプロジェクトの外に作ってください。

```bash
cd services/one-backend-python/api
python3 -m venv /tmp/uvicorn-venv && . /tmp/uvicorn-venv/bin/activate
pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0"
uvicorn main:app --app-dir src --port 4000 --reload
```

2つ目のターミナルで、`.localhost` の URL の代わりに `http://localhost:4000/health` を使って、例のフォルダーから「保存から準備完了まで」の手順を繰り返してください。終わったら Ctrl-C で停止します。

issue の Postgres の部分が気になる場合は、Postgres の起動中に API がログに出す接続エラーもメモしてください。`tdk logs` で確認できます。

## 5. フォームに記入する

[フォーム](https://github.com/flisk-sh/tdk-cli-core/issues/new?template=try-it-and-report.yml)を開き、自分の言葉で答えてください。役に立つ報告の例を2つ示します（数値は説明用に作ったものです）。

**動いた、数値付き**

| 項目 | 例 |
|---|---|
| 何を試しましたか？ | examples/one-backend-python を実行し、時間を計測した |
| どうでしたか？ | 動いたが、何かが遅い、または妙だった |
| 何を見ましたか？ | 初回の `tdk up` 4 分 10 秒。ウォームの `tdk up` 35 秒。保存から準備完了まで、TDK では約 6 秒、`uvicorn --reload` では約 1 秒。 |
| Your setup | macOS 15、OrbStack、tdk 1.3.126 |

**失敗した**

| 項目 | 例 |
|---|---|
| 何を試しましたか？ | 新規クローンで `tdk up one-backend-python` |
| どうでしたか？ | 失敗した |
| 何を見ましたか？ | 約 2 分後に `✗ api-backend failed` で停止した。`tdk status` ではエラーと表示される。 |
| 貼り付けた出力 | `tdk up` と `tdk status` が表示したテキスト |
| Your setup | WSL2 上の Ubuntu 24.04、Docker Desktop、tdk 1.3.126 |

どれも必須ではありませんが、報告を対応しやすくするものです。

- 初回の実行か、繰り返しの実行かを書く。
- スクリーンショットではなくテキストを貼り付ける。検索できるようになります。
- 貼り付けるものからパスワードやトークンを削除する。
- 何を期待していたかがあれば書く。

回答は、通常 1 営業日以内に issue へ返信することを目指しています。さらに踏み込んで、意図的にバグを探したい場合は、[TDK でバグを見つける](finding-bugs-ja.md)を参照してください。

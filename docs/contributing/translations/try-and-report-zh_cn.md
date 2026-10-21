# 试用并报告你看到的内容

> 本页是 [try-and-report.md](../try-and-report.md) 的翻译。如有差异，以英文版为准。

你不需要编写代码，也不需要撰写精美的 bug 报告。本页介绍如何安装 Flisk、运行一个示例，并通过一份简短的表单告诉我们发生了什么。粗略的笔记也没问题：一份带有真实数据的未完成报告，比没有报告更有帮助。

[打开表单](https://github.com/flisk-sh/flisk/issues/new?template=try-it-and-report.yml)。它有三个简短的必填项（你尝试了什么、结果如何、你看到了什么），其余都是可选的。

## 1. 安装

你需要运行中的 Docker（Desktop、OrbStack 或 Colima），以及 Tilt 0.25.0 或更新版本。然后安装 Flisk CLI：

```bash
curl -fsSL https://raw.githubusercontent.com/flisk-sh/flisk/main/install.sh | sh
flisk --version
```

将 `flisk --version` 的输出复制到表单中的 "Your setup" 框里。如果安装失败，这本身也是一份有用的报告：请粘贴错误信息并说明你的操作系统。

## 2. 获取示例

```bash
git clone https://github.com/flisk-sh/flisk.git
cd flisk/examples/one-backend-python
```

该示例是一个 FastAPI 服务。完整说明请参阅它自己的 [README](../../../examples/one-backend-python/README.md)。

## 3. 运行它

```bash
flisk project --yes
time flisk up one-backend-python
```

只有当每个服务都就绪时，`flisk up` 才会打印 `Flisk is up.`，因此 `time` 打印的 `real` 一行就是你的首次启动时间，包括镜像构建和依赖安装。检查服务是否响应：

```bash
curl --fail http://api.one-backend-python.localhost/api/api-backend/health
# {"status":"ok","service":"api-backend"}
```

如果 80 端口被占用，Flisk 会选择另一个端口。`flisk doctor --json` 会显示具体是哪一个。

如果出现任何失败，请运行 `flisk status` 和 `flisk doctor`，并粘贴它们的输出。使用 `flisk down` 停止所有服务。

## 4. 可选：我们缺少的计时数据

这三个数字是 [issue 683](https://github.com/flisk-sh/flisk/issues/683) 正在等待的数据。你可以按需完成任意数量的测量，并说明你跳过了哪些。

**首次启动。** 第 3 步中 `time flisk up` 的结果。

**热启动。** 停止服务栈后再次启动。镜像已经构建好了，所以这次应该更快：

```bash
flisk down
time flisk up one-backend-python
```

**保存到就绪。** 修改一行代码，测量服务响应该变更所需的时间。我们修改 `/health` 返回的单词 `ok`。示例 README 中写明，目前每次编辑都会重新构建镜像，所以预计需要几秒，而不是毫秒级。我们想看的正是这个数字：

```bash
now() { perl -MTime::HiRes=time -e 'printf "%.1f", time'; }
f=services/one-backend-python/api/src/main.py
perl -pi -e 's/"status": "ok"/"status": "changed"/' "$f"
start=$(now)
until curl -fs http://api.one-backend-python.localhost/api/api-backend/health | grep -q changed; do sleep 0.2; done
echo "save to ready: $(perl -e "printf '%.1f', $(now) - $start") s"
git checkout -- "$f"   # 撤销修改
```

**与 `uvicorn --reload` 对比。** 不使用 Flisk，运行同样的改动，以便看出差距（如果有的话）。这需要 Python 3.12 或更新版本。先运行 `flisk down`，避免两者争抢 CPU，并且把虚拟环境放在项目之外：

```bash
cd services/one-backend-python/api
python3 -m venv /tmp/uvicorn-venv && . /tmp/uvicorn-venv/bin/activate
pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0"
uvicorn main:app --app-dir src --port 4000 --reload
```

在第二个终端中，使用 `http://localhost:4000/health` 代替 `.localhost` 地址，从示例目录重复一次“保存到就绪”的步骤。完成后按 Ctrl-C 停止。

如果 issue 中关于 Postgres 的部分对你很重要，还请记录 API 在 Postgres 启动期间记录的任何连接错误。`flisk logs` 会显示它们。

## 5. 填写表单

打开[表单](https://github.com/flisk-sh/flisk/issues/new?template=try-it-and-report.yml)，用你自己的话作答。下面给出两个有用报告的示例（数字为虚构，仅作说明）：

**运行成功，并附有数字**

| 字段 | 示例 |
|---|---|
| 你尝试了什么？ | 运行 examples/one-backend-python 并计时 |
| 进展如何？ | 运行成功，但某些地方较慢或不正常 |
| 你看到了什么？ | 首次 `flisk up` 用时 4 分 10 秒。热启动 `flisk up` 用时 35 秒。保存到就绪：Flisk 约 6 秒，`uvicorn --reload` 约 1 秒。 |
| Your setup | macOS 15、OrbStack、flisk 1.3.126 |

**运行失败**

| 字段 | 示例 |
|---|---|
| 你尝试了什么？ | 在全新克隆的仓库中执行 `flisk up one-backend-python` |
| 进展如何？ | 失败了 |
| 你看到了什么？ | 约 2 分钟后停止，显示 `✗ api-backend failed`。`flisk status` 将其显示为错误。 |
| 粘贴的输出 | `flisk up` 和 `flisk status` 打印的文本 |
| Your setup | WSL2 中的 Ubuntu 24.04、Docker Desktop、flisk 1.3.126 |

以下内容能让报告更容易处理，但都不是必需的：

- 说明这是首次运行还是重复运行。
- 粘贴文本，而不是截图，这样我们可以搜索。
- 从你粘贴的任何内容中删除密码和令牌。
- 如果你有预期，请说明你的预期是什么。

我们的目标是在一个工作日内在 issue 中回复。如果你想进一步主动寻找 bug，请参阅 [查找 Flisk 中的 bug](../finding-bugs.md)。

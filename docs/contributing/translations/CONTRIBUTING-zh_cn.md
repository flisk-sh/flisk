# 为 Flisk 做贡献

[English](../../../CONTRIBUTING.md) | 简体中文 | [繁體中文](CONTRIBUTING-zh_tw.md) | [日本語](CONTRIBUTING-ja.md) | [한국어](CONTRIBUTING-ko.md)

> 本页是 [CONTRIBUTING.md](../../../CONTRIBUTING.md) 的翻译。如有不一致，以英文版为准。链接的指南目前只有英文版。

欢迎！小修复和大功能都很有价值。先从简短的[贡献者指南](../README.md)开始：它会带你完成找到要改的内容、动手修改、检查结果，以及提交 pull request 的全过程。

## 从这里开始

1. [选择你的改动并准备好仓库](../01-first-change.md)。
2. [按照对应类型的改动步骤操作](../02-feature-recipes.md)。
3. [检查你的工作并提交 pull request](../03-open-a-pr.md)。
4. [审查别人的 pull request](../04-review-a-pr.md)，可使用一键 AI 审查按钮。

[前端 provider 指南](../../frontend-framework-providers.md)给出了添加 Vue 等其他 Vite 框架的具体步骤。[后端 provider 指南](../../backend-language-providers.md)介绍了如何添加 Python 等后端语言。

## 快速设置

你需要 Git、[Bun](https://bun.sh) 和 Node.js 22.12+。大多数改动不需要 Docker 和 Tilt。

```bash
git clone https://github.com/flisk-sh/tdk-cli-core.git
cd tdk-cli-core
bun install
bun run typecheck && bun run lint && bun run test   # 约一分钟；在你修改任何东西之前，这些都应该通过
```

如果在全新的检出上其中某一步失败，那是项目的 bug，不是你的环境问题：请[提交 issue](https://github.com/flisk-sh/tdk-cli-core/issues/new/choose)。

## 寻找 bug

不写代码也能帮忙。运行一个命令，把它的输出与 Flisk 的承诺（它的 `--help`、文档或另一个命令）进行比较，并报告任何差异。那就是 bug。

[在 Flisk 中寻找 bug](../finding-bugs.md) 有具体步骤：用于测试的临时项目、带有预期输出的命令清单、过去发现 bug 的模式，以及维护者可以直接处理的报告格式。例如，如果 `flisk networks` 没有列出任何 URL，而 `flisk up --dry-run` 却打印了它们，说明两个命令不一致，其中一个是错的。

## 审查 pull request

不写代码也可以通过审查开放的 [pull request](https://github.com/flisk-sh/tdk-cli-core/pulls) 来帮忙。每个 PR 末尾都有 **Grok**、**Claude** 和 **Codex** 按钮，点击后会打开一个已经请求审查该 PR 的 AI 对话。AI 是你的助手：请对照 diff 核实它说的内容，然后在 GitHub 上以 **Comment**、**Approve** 或 **Request changes** 提交你自己的审查。

第一次审查之前，请阅读[必读文档](../04-review-a-pr.md#before-your-first-review-required-reading)（大约一小时，只需一次）。然后 [审查 pull request](../04-review-a-pr.md) 会一步步讲解这些按钮，并提供批准和请求修改时的评论示例。

## 寻找可以做的事

- 🗺️ [Flisk 之旅](../../journey/README.md)：选择一个岛屿，完成任务，提升段位（8 kyu → 1 dan）
- [Good first issues](https://github.com/flisk-sh/tdk-cli-core/labels/good%20first%20issue)
- [Help wanted](https://github.com/flisk-sh/tdk-cli-core/labels/help%20wanted)
- 使用逐步清单[寻找 bug](../finding-bugs.md)
- [报告 bug 或提问](https://github.com/flisk-sh/tdk-cli-core/issues/new/choose)

如果你选了一个 issue，请评论 `I'll take this`（或 `I would like this one`、`I'd like to work on this`、`Can I take this?`）。机器人会把它分配给你并加上 `claimed` 标签，避免两个人做同样的工作。认领后 14 天没有 pull request 会收到提醒，21 天后会被释放；草稿 PR 也算作进展。报告 bug 时，请尽量附上 `flisk doctor` 的输出。

## 拼写检查

使用 `cargo install typos-cli --version 1.50.3` 安装固定版本的检查器，然后在仓库根目录运行 `typos` 检查拼写。

## 标签

用标签找到符合你兴趣和经验的工作。维护者会在分诊时添加标签；issue 表单和 PR labeler 也会自动添加一些标签。在线的[标签列表](https://github.com/flisk-sh/tdk-cli-core/labels)包含每个标签的说明。

| 标签 | 含义 | 何时添加 |
| --- | --- | --- |
| `bug` | 某些功能没有按预期工作。 | bug 报告表单和已确认的缺陷。 |
| `enhancement` | 新功能或改进。 | 功能请求表单和已接受的改进。 |
| `documentation` | 缺失、错误或不清楚的文档。 | 文档表单和文档工作。 |
| `good first issue` | 小而独立、几乎不需要了解仓库的任务。 | 维护者认为适合作为第一次贡献。 |
| `help wanted` | 需要社区帮助的任务，通常比 first issue 更大。 | 维护者欢迎有人接手。 |
| `difficulty: easy`、`difficulty: medium`、`difficulty: hard` | 几小时、一两天，或需要深入了解仓库或进行设计的工作。 | 维护者估计任务难度；与贡献者标签互为补充。 |
| `question` | 请求澄清。 | 维护者把它当作问题而不是实现任务来分诊。 |
| `duplicate` | 已有其他 issue 或 PR 覆盖了该工作。 | 维护者会链接原始讨论。 |
| `invalid`、`wontfix` | 无效的报告，或项目不会做的工作。 | 维护者会说明为什么不继续。 |
| `premium` | Premium 许可证请求和付费功能。 | premium issue 表单或维护者分诊。 |
| `tracking` | 包含相关任务的总括 issue。 | 维护者把跨多个 issue 的工作归在一起。 |
| `community`、`examples`、`growth` | 社区工作、示例项目或推广改进。 | 维护者识别推广和采用相关任务。 |
| `dx`、`design`、`guide` | 开发者体验、视觉或 UX 打磨，或书面指南。 | 维护者识别改进的类型。 |
| `testing`、`ci`、`packaging` | 测试、GitHub Actions，或安装程序和软件包。 | 维护者识别验证和交付工作。 |
| `agents` | 面向 AI 编码代理的文档和文件。 | 维护者识别面向代理的工作。 |
| `rfc` | 实现之前的设计讨论。 | 维护者要求先就提案范围达成一致。 |
| `windows` | Windows 和 WSL2 支持。 | 维护者识别特定平台的工作。 |
| `performance`、`benchmark` | 速度或内存改进，或测量工具。 | 维护者识别优化和测量工作。 |
| `hacktoberfest` | 参加 Hacktoberfest 的工作。 | 维护者选择符合活动条件的贡献。 |
| `area:*` | 受影响的部分，例如 `area: tui`、`area: doctor` 或 `area: cli`。 | 维护者给 issue 加标签；PR labeler 根据改动路径推断区域。 |
| `tech:*` | 相关技术，例如 TypeScript、Docker 或 Tilt。 | 维护者识别任务涉及的工具。 |
| `rank:*`、`island:*` | Flisk 之旅中的任务规模和主题。 | 维护者把任务放到贡献者地图上。 |
| `event:*` | 针对特定活动的工作，例如 GitHub Universe。 | 维护者组织特定活动的工作。 |

## 签署你的提交

每个提交都需要 [Developer Certificate of Origin](../../../DCO) 签署。使用 `git commit -s` 添加，它会追加 `Signed-off-by: Your Name <you@example.com>`。要修复已有的提交，请运行 `git rebase --signoff origin/main` 并强制推送你的分支。如果某个提交缺少这一行，pull request 检查会失败。

## 把你的团队加入采用者列表

在你自己的仓库中使用 Flisk？你可以通过两种方式被列入 [ADOPTERS.md](../../../ADOPTERS.md)：打开 [We use Flisk](https://github.com/flisk-sh/tdk-cli-core/issues/new?template=we-use-flisk.yml) issue 表单，或在 pull request 中向表格添加一行。[What counts](../../../ADOPTERS.md#what-counts) 说明了应该链接什么，以及什么不算。

## 治理

请参阅 [GOVERNANCE.md](../../../GOVERNANCE.md) 了解如何做出决定以及如何增加维护者，[MAINTAINERS.md](../../../MAINTAINERS.md) 了解谁可以合并，[ADOPTERS.md](../../../ADOPTERS.md) 了解哪些团队在使用 Flisk。

## 友善待人

参与即表示你同意遵守[行为准则](../../../CODE_OF_CONDUCT.md)。请使用 [SECURITY.md](../../../SECURITY.md) 私下报告安全问题，不要在公开 issue 中报告。

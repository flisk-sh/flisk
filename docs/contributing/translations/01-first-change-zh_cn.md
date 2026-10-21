# 1. 准备进行改动

> 本页是 [01-first-change.md](../01-first-change.md) 的翻译。如有差异，以英文版为准。

你不需要理解整个仓库。选一个小改动，按照对应的指南操作。如果某一步不清楚，请在 issue 中提问。

以下步骤只需做一次，用于安装 Flisk CLI 及其检查所需的工具。

## 最快的方式：Dev Container / Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/flisk-sh/tdk-cli-core?quickstart=1)
[![Open in Dev Containers](https://img.shields.io/badge/Open%20in-Dev%20Containers-blue?logo=visualstudiocode)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/flisk-sh/tdk-cli-core)
[![Open in Gitpod](https://img.shields.io/badge/Open%20in-Gitpod-908a00?logo=gitpod)](https://gitpod.io/#https://github.com/flisk-sh/tdk-cli-core)
[![Open in Firebase Studio](https://img.shields.io/badge/Open%20in-Firebase%20Studio-4285F4?logo=firebase)](https://idx.google.com/import?url=https://github.com/flisk-sh/tdk-cli-core)
[![Open in Replit](https://img.shields.io/badge/Open%20in-Replit-F26207?logo=replit)](https://replit.com/github/flisk-sh/tdk-cli-core)
[![Open in DevPod](https://img.shields.io/badge/Open%20in-DevPod-1C1C1C?logo=devpod)](https://devpod.sh/open#https://github.com/flisk-sh/tdk-cli-core)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-1269D3?logo=stackblitz)](https://stackblitz.com/github/flisk-sh/tdk-cli-core)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-151515?logo=codesandbox)](https://codesandbox.io/p/github/flisk-sh/tdk-cli-core)

或者克隆仓库后，在 VS Code 中使用 **Dev Containers: Reopen in Container**。

默认容器提供 Node.js 22 和 Bun，并会自动运行 `bun install`。启动后可以直接运行：

```bash
bun run typecheck
bun run lint
bun run test
```

Docker 和 Tilt 是可选的，不包含在默认容器中。只有需要运行 Flisk 服务或完整的本地环境时才需要添加。

## 需要准备的内容（本地安装）

- Git
- [Bun](https://bun.sh)
- Node.js 22.12 或更高版本
- 仅当需要运行 Flisk 服务或检查完整本地环境时，才需要 Docker 和 [Tilt](https://docs.tilt.dev/install.html)

## 将仓库复制到你的电脑

打开终端并运行：

```bash
git clone https://github.com/flisk-sh/tdk-cli-core.git
cd tdk-cli-core
bun install
git switch -c my-change
```

把 `my-change` 替换为一个简短的名称，例如 `docs-new-framework-guide`。

## 找到一个改动

1. 打开 [good first issues](https://github.com/flisk-sh/tdk-cli-core/labels/good%20first%20issue) 或 [help wanted issues](https://github.com/flisk-sh/tdk-cli-core/labels/help%20wanted)。
2. 阅读 issue，确认是否已有人在处理。
3. 评论 `I'll take this`（或 `I would like this one`）；机器人会将你指派为负责人并添加 `claimed` 标签。如果还没有 issue，在开始较大的功能之前先开一个描述该改动的 issue。
4. 使用[功能指南](02-feature-recipes-zh_cn.md)找到可能需要修改的文件和检查项。

## 何时编写变更提案

当改动影响面向用户的契约、manifest 或生成格式，或涉及多个子系统时，使用 OpenSpec。[Vue provider 改动](../../../openspec/changes/archive/2026-09-28-add-vue-frontend-adapter/proposal.md)是一个已完成的示例，包含 proposal、design、specs 和 tasks。如果你的机器上没有安装 `openspec` 命令，请在 issue 中先询问，再开始跨领域的改动。

在仓库根目录运行：

```bash
openspec list
openspec new change "short-change-name"
openspec status --change "short-change-name"
```

按照 OpenSpec 打印的说明创建适用的 proposal、design、specs 和 tasks。拼写修正、链接修正或小的独立改动通常不需要提案。

## 运行快速检查

在仓库根目录中，CLI 的检查命令为：

```bash
bun run typecheck
bun run lint
bun run test
```

在最后一次编辑之后再次运行检查。如果某项检查失败，请把失败信息附在 PR 中，并说明你尝试过什么。各领域的检查请参阅 [PR 指南](03-open-a-pr-zh_cn.md)。

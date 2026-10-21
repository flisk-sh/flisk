# 3. 检查你的改动并提交 pull request

> 本页是 [03-open-a-pr.md](../03-open-a-pr.md) 的翻译。如有差异，以英文版为准。

## 运行与你的改动相关的检查

除非命令另有说明，请在仓库根目录运行检查。

| 改动 | 需要运行的检查 |
|---|---|
| CLI 代码或生成的 CLI 行为 | `bun run typecheck`、`bun run lint`、`bun run test` |
| CLI 测试使用的引擎/Starlark 生成器 | 运行 `bun run typecheck`、`bun run lint`，以及 `cd cli && TDK_REQUIRE_TILT=1 npm test`。CI 测试任务会安装 Tilt 并设置此标志。 |
| Python 引擎测试区域 | 运行一次 `python3 -m pip install -r tests/requirements.txt` 安装测试包，然后用 `pytest` 运行相关测试文件，或使用 `make test-tilt-engine` 运行该套件。其中部分测试在干净的检出上也会失败；哪些测试、为什么失败，请参阅 #700。这些 Python 检查不会由 `.github/workflows/ci.yml` 运行。 |
| 仅文档 | 检查你修改过的链接和命令；作为新手通读一遍页面。 |

除非你确实运行过某项检查，否则不要说它已通过。如果无法运行某项检查，请说明原因。

### 如果 golden 输出测试失败

三个示例项目生成的 Tilt 和 Compose 文件，会与 `cli/src/generator/__tests__/golden/` 中已提交的副本进行比对。如果你是有意修改了 `cli/templates/` 中的模板或生成器，测试会失败，并列出每个发生变化的文件。运行 `UPDATE_GOLDEN=1 bun run test -- golden-generated-output` 来接受这些变化，阅读 golden 文件的差异，并将它们与你的改动一起提交。如果你并不打算改变生成的输出，请修复原因，而不是更新这些文件。现有项目也会看到相同的字节变化，因此在它们下一次运行 `flisk config regenerate` 之前，`flisk config verify` 会报告它们不同步；请在 PR 中说明这一点。

## 展示改动内容

对于 bug 修复或行为改动，如果可能，请在 `main` 和你的分支上执行相同的步骤。粘贴真实的前后输出，不要凭记忆重现。包括命令、项目或夹具，以及重现所需的任何设置。覆盖 issue 中提到的空状态、错误状态或恢复状态。

如果你要测试构建后的 CLI 入口，请先运行 `bun run build`，以免使用旧的编译文件。在真实终端中检查 `flisk ui` 等交互式命令。如果缺少自动化测试，请说明原因，并链接一个用于添加测试的 issue。新行为和 bug 修复需要在同一个 pull request 中包含测试；请参阅 [CONTRIBUTING.md 中的测试](../../../CONTRIBUTING.md#tests)。

## 推送你的分支

如果你对仓库有写入权限：

```bash
git add path/to/your/files
git commit -m "Describe the change"
git push -u origin my-change
```

如果你是从 fork 贡献，请推送到你的 fork，然后从该分支发起 pull request。

## 打开 pull request

前往 GitHub 上的仓库。点击你分支的 **Compare & pull request**，或选择 **Pull requests → New pull request**。选择 `main` 作为目标分支，然后填写：

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

删除不适用的清单项。如果有助于审阅者看清改动，请添加截图或真实的终端输出。切勿包含密码、令牌、私有 URL 或个人文件路径。

## 在点击“Create pull request”之前

- [ ] PR 只做一件主要的事。
- [ ] 我已关联 issue，或说明了该改动为何有用。
- [ ] 我已更新受改动影响的文档或示例。
- [ ] 我列出了实际运行过的检查，并说明了任何缺口。
- [ ] 如果行为发生了变化，我提供了前后对比的证据。

打开 PR 后，GitHub 会运行 CI。如果某项检查失败，请阅读其日志，在同一分支上修复后重新推送，PR 会自动更新。然后回答审阅者在 PR 上提出的问题。

GitHub 还会在你的 PR 描述末尾添加 **Grok**、**Claude** 和 **Codex** 按钮。点击其中一个，就能在别人查看之前获得 AI 对你自己 PR 的审查。[审查 pull request](04-review-a-pr-zh_cn.md) 解释了这些按钮的工作方式，以及审阅者如何批准或要求修改。

## GitHub 运行的内容

[PR 模板](../../../.github/pull_request_template.md)会要求你选择改动所涉及的领域，并展示每个领域的简短说明。GitHub 还会根据改动的路径添加对应的 `area:*` 标签，并在你推送更新的差异时移除过时的领域标签。标签用于整理 PR；由工作流的路径规则决定运行哪些自动化。

- **每个 pull request：** [CI](../../../.github/workflows/ci.yml) 会运行 lint、typecheck、CLI 测试和包冒烟检查。部分额外的 CI 任务取决于改动了哪些文件或仓库设置。
- **运行时文件有改动：** 当 PR 修改了 `cli/`、`engine/` 或 `discovery/` 下的文件，或修改了 `Tiltfile`、`package.json` 或该工作流文件时，Quickstart E2E 也会运行。
- **框架示例：** 添加 Vue、React 或其他 provider 会改动 `cli/` 和 `engine/`，因此始终运行的 CI 和 Quickstart E2E 都会运行。
- **仅文档改动：** 始终运行的 CI 仍会运行。除非 PR 同时修改了 Quickstart E2E 所列出的路径之一，否则 Quickstart E2E 不会运行。

其他示例应用以及 100 个服务的夹具基准检查是按计划运行或通过手动请求运行的，并非每个 PR 都会运行。你可以在 `.github/workflows/` 中每个工作流文件的顶部查看其触发路径。

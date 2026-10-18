# 4. 审查 pull request

> 本页是 [04-review-a-pr.md](../04-review-a-pr.md) 的翻译。如有差异，以英文版为准。

任何人都可以审查 pull request。每次审查都遵循相同的规则：

1. 用 AI 审查按钮做第一轮检查。
2. 自己对照 diff 检查 AI 提出的每一点。
3. 在 GitHub 上提交你自己的审查，并说明你检查了什么。

你对提交的审查负责，而不是 AI。

## 第一次审查前：必读文档

审查之前请阅读这些内容。总共大约需要一小时，只需读一次。如果不读，你将无法判断 AI 的意见是否正确。

**什么是 TDK**

- [ ] [README](../../../README.md)：TDK 做什么，以及人们使用哪些命令。
- [ ] [项目概览](../../project-overview.md)：Project → Stack → Resource 模型。
- [ ] [范围](../../scope.md)：TDK 适用于什么，不适用于什么。
- [ ] [生成的文件](../../generated-files.md)：TDK 会写入哪些文件。永远不要手动编辑生成的文件；应修改生成它们的输入。

**我们如何工作**

- [ ] [贡献指南](../../../CONTRIBUTING.md)：标签、issue 认领和 DCO 签署。
- [ ] [1. 准备进行改动](01-first-change-zh_cn.md)：何时需要 OpenSpec 提案。
- [ ] [2. 各类改动的指南](02-feature-recipes-zh_cn.md)：代码位于何处，以及每种改动需要哪些检查。
- [ ] [3. 提交 pull request](03-open-a-pr-zh_cn.md)：一个好的 PR 应包含什么，包括前后对比的证据。

**所有人都遵守的规则**

- [ ] [行为准则](../../../CODE_OF_CONDUCT.md)：在审查中如何彼此交流。
- [ ] [安全策略](../../../SECURITY.md)：私下报告安全问题，切勿在 PR 评论中报告。
- [ ] [治理](../../../GOVERNANCE.md)和[维护者](../../../MAINTAINERS.md)：谁做决定，谁负责合并。

然后试一次：运行[快速设置](../../../CONTRIBUTING.md#quick-setup)，这样你就可以检出 PR 并自己运行其检查。

## 简要步骤

1. 在 GitHub 上打开 PR，滚动到 PR 描述的末尾。
2. 点击 **Review this PR in** 下方的 **Grok**、**Claude** 或 **Codex**。
3. 阅读 AI 的回答。对照 diff 自己检查每一点。
4. 在 PR 页面点击 **Files changed**，然后点击 **Review changes**（右上角；在某些布局下为 **Submit review**）。
5. 写下你的评论，选择 **Comment**、**Approve** 或 **Request changes**，然后点击 **Submit review**。

## AI 是你的助手，而不是审阅者

AI 按钮会打开一个与 AI 助手的聊天。这个助手属于你：它在你自己的账户中回答你，聊天内容不会与 PR 作者或其他审阅者共享。它不会在 GitHub 上发布任何内容，不会批准任何内容，也不会修改任何代码。

你才是审阅者。算数的是你以自己的名字在 GitHub 上提交的审查。因此：

- **复制之前先检查。** AI 可能出错。它可能凭空指出 diff 中不存在的问题，也可能漏掉真正的问题。打开它所指的文件和行，自己确认。
- **用你自己的话来写。** 只粘贴你检查过并同意的要点。删掉其余内容。
- **说明你没有检查什么。** “我读了代码，但没有运行它”也是一份有用的审查。
- **永远不要把机密信息粘贴到聊天中。** 令牌、密码和私有 URL 不应出现在 AI 聊天或 PR 评论中。

## AI 审查按钮如何工作

当有人打开、重新打开或编辑 PR 时，[AI 审查按钮工作流](../../../.github/workflows/ai-review-buttons.yml)会在 PR 描述的末尾添加这一部分：

> **Review this PR in**
> \[Grok\] \[Claude\] \[Codex\]

每个按钮都是普通链接。它会在新标签页中打开 AI 的网站，并且这条消息已经预先输入好了。

```text
Review this pull request. Read the title and diff at https://github.com/tdk-landscape/tdk-cli-core/pull/123.
```

| 按钮 | 打开的网站 |
|---|---|
| **Grok** | grok.com |
| **Claude** | claude.ai |
| **Codex** | chatgpt.com |

选择你平时使用的即可。它们收到的消息都相同。每个网站可能会要求你登录；如果登录后聊天框是空的，请再次点击按钮。如果你尚未登录，请复制上面的消息，填入 PR 的链接，然后粘贴到任意 AI 聊天中。

需要注意的事项：

- **CI 中不会运行任何东西。** 该工作流只是把链接写入描述。在你点击之前，不会调用任何 AI。
- **你的文字是安全的。** 该部分会添加在作者文字之后，并且从不修改作者的文字。如果作者在同一时刻正在编辑描述，工作流会跳过更新，而不是覆盖他们的编辑。
- **按钮缺失？** 编辑 PR 描述并保存（任何小改动都可以），工作流就会添加按钮。维护者也可以在 **Actions** 标签页中手动运行该工作流，为每个开放的 PR 添加按钮。

### 提出更好的后续问题

第一次回答是摘要。提出后续问题，可以得到更有用的审查：

- “哪个改动可能会破坏现有用户？请指出文件和行。”
- “这个 diff 中是否有缺少测试的地方？”
- “PR 描述是否与代码的实际行为一致？”
- “请像向新手解释一样，说明 `cli/src/commands/up.ts` 第 40–60 行。”
- “请针对你确定的问题，写一条简短、友好的审查评论。”

### 合并冲突按钮

如果 PR 与 `main` 发生冲突，[AI 冲突按钮工作流](../../../.github/workflows/ai-conflict-buttons.yml)会在 PR 上发布一条评论，其中带有 Grok、Claude 和 Codex 的 **Resolve conflict** 按钮。这些按钮会为 AI 提供逐步指令，让它把 `main` 合并到分支并推送修复。如果 AI 无法推送到该分支（例如你不拥有的 fork），指令会告诉它改为推送到 `fix/<PR 编号>-conflict` 分支，并打开一个替代 PR。如果原 PR 写有 `Fixes #N`，替代 PR 也会写。请像检查其他改动一样检查结果，并在原 PR 上评论，附上替代 PR 的链接。冲突解决后，同一条评论会改为说明已解决，按钮也会消失。

## 检查什么

你不必检查所有内容。挑选你能检查的部分，并说明你检查了哪些。

- [ ] **它是否符合描述？** 将标题和 “What changed” 与 diff 进行比较。
- [ ] **是否只做一个聚焦的改动？** 无关的编辑应放在单独的 PR 中。
- [ ] **有证据吗？** 对于修复或行为改动，PR 应展示真实的前后输出（参见[展示改动内容](03-open-a-pr-zh_cn.md#展示改动内容)）。
- [ ] **检查是否通过？** 查看 **Conversation** 标签页底部的检查项。失败的检查需要修复或说明。
- [ ] **文档是否已更新？** 新选项或修改过的命令，也需要更新文档。
- [ ] **是否存在风险？** 机密信息、已删除的文件、更改的默认值或新的依赖项，都值得提出疑问。
- [ ] **你能理解吗？** 如果作为新手你无法理解代码，请直说。这同样是有用的反馈。

## 对具体行发表评论

1. 打开 **Files changed** 标签页。
2. 将鼠标悬停在某一行上，然后点击出现的蓝色 **+**。拖动可以选择多行。
3. 输入你的评论。
4. 点击 **Start a review**（如果已经开始，则点击 **Add review comment**）。这会让你的评论在提交前保持为草稿，作者只会收到一次通知，而不是多次。

**Add single comment** 会立即发布。用于简短的问题，而不是完整的审查。

若要提出精确的修复建议，请点击评论框中的 **±** 图标（**Insert a suggestion**），然后编辑代码块中的内容。作者可以一键应用。

## 提交审查

点击 **Files changed** 右上角的 **Review changes**，写一段总结，然后选择三个选项之一。

### Comment：不做决定的反馈

当你有问题或小的意见，或者只检查了 PR 的一部分时，请使用 **Comment**。

```markdown
Read the CLI changes; did not run them.

Question: what happens when `--port` is 0? The help text does not say.
```

### Approve：“可以了”，附带备注

当你已检查 PR 并认为它可以合并时，使用 **Approve**。你可以在批准的同时留下一些小意见。请明确将其标记为可选，让作者知道它们不会阻塞合并。

```markdown
Looks good. I ran `bun run test` on this branch and tried `tdk up --dry-run` in the restaurant example: the new URLs show up as described.

Optional (nit): `parsePort` could use a test for an empty string. Fine to do in a follow-up.
```

### Request changes：“还不行”，附带原因

当有内容必须在合并前修复时，使用 **Request changes**。这是在 GitHub 上拒绝 PR 的方式：它不会关闭 PR，而是告诉作者需要修复什么。务必说明哪里有问题、位置在哪，以及怎样才算合格。

```markdown
Thanks for this! Two things need fixing before merge:

1. `cli/src/commands/up.ts` line 52: the new flag is read but never passed to the generator, so `--no-cache` has no effect. Could you pass it through and add a test?
2. The README still shows the old flag name `--nocache`.

Everything else looks good. Happy to re-review once these are in.
```

当作者推送修复后，重新打开 **Files changed**，检查新的提交，然后提交一次新的审查。如果问题已解决，请选择 **Approve**。你之前的“changes requested”会一直保留在 PR 上，直到你提交新的审查。

### 关闭 PR

请求修改不等于关闭。只有维护者会关闭 PR，通常是在改动不会被接受，或作者停止回应时。如果你认为 PR 应该关闭，请在 **Comment** 中说明原因，并交由维护者决定。

## 写出友善、清晰的评论

- 既要说明什么是好的，也要说明什么有问题。
- 要具体：指出文件和行，并解释原因。
- 用提问代替命令：“Could this be…?” 比 “Change this.” 更有效。
- 对小问题加上 `nit:` 或 `optional:` 标记，让作者知道它们不会阻塞合并。
- 审查代码，而不是评判人。

每条评论都要遵守[行为准则](../../../CODE_OF_CONDUCT.md)。

## 通过终端（可选）

使用 [GitHub CLI](https://cli.github.com)，你也可以在终端中完成同样的操作：

```bash
gh pr checkout 123
```

```bash
gh pr review 123 --comment --body "Read the CLI changes; did not run them."
```

```bash
gh pr review 123 --approve --body "Ran bun run test on this branch; looks good."
```

```bash
gh pr review 123 --request-changes --body "The new flag is never passed to the generator (up.ts line 52)."
```

## 谁可以批准和合并

- 任何人都可以评论、批准或要求修改。每一次审查都能帮助维护者更快地做出决定。
- 你不能批准自己的 PR。
- 只有[维护者](../../../MAINTAINERS.md)可以合并。在合并之前，他们会检查审查情况以及所需的检查是否通过。

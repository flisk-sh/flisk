# 4. 審查 pull request

> 本頁是 [04-review-a-pr.md](../04-review-a-pr.md) 的翻譯。如有差異，以英文版為準。

任何人都可以審查 pull request。每次審查都遵循相同的規則：

1. 用 AI 審查按鈕做第一輪檢查。
2. 自己對照 diff 檢查 AI 提出的每一點。
3. 在 GitHub 上提交你自己的審查，並說明你檢查了什麼。

你對所提交的審查負責，而不是 AI。

## 第一次審查前：必讀文件

審查之前請閱讀以下內容。總共大約需要一小時，只需讀一次。如果不讀，你將無法判斷 AI 的意見是否正確。

**什麼是 Flisk**

- [ ] [README](../../../README.md)：Flisk 做什麼，以及人們使用哪些指令。
- [ ] [專案概覽](../../project-overview.md)：Project → Stack → Resource 模型。
- [ ] [範圍](../../scope.md)：Flisk 適用於什麼，不適用於什麼。
- [ ] [產生的檔案](../../generated-files.md)：Flisk 會寫入哪些檔案。永遠不要手動編輯產生的檔案；應修改產生它們的輸入。

**我們如何運作**

- [ ] [貢獻指南](../../../CONTRIBUTING.md)：標籤、issue 認領和 DCO 簽署。
- [ ] [1. 準備進行改動](01-first-change-zh_tw.md)：何時需要 OpenSpec 提案。
- [ ] [2. 各類改動的指南](02-feature-recipes-zh_tw.md)：程式碼位於何處，以及每種改動需要哪些檢查。
- [ ] [3. 提交 pull request](03-open-a-pr-zh_tw.md)：一個好的 PR 應包含什麼，包括前後對比的證據。

**所有人都遵守的規則**

- [ ] [行為準則](../../../CODE_OF_CONDUCT.md)：在審查中如何彼此溝通。
- [ ] [安全政策](../../../SECURITY.md)：私下回報安全問題，切勿在 PR 留言中回報。
- [ ] [治理](../../../GOVERNANCE.md)和[維護者](../../../MAINTAINERS.md)：誰做決定，誰負責合併。

然後試一次：執行[快速設定](../../../CONTRIBUTING.md#quick-setup)，這樣你就可以檢出 PR 並自己執行其檢查。

## 簡要步驟

1. 在 GitHub 上開啟 PR，捲動到 PR 描述的末尾。
2. 點擊 **Review this PR in** 下方的 **Grok**、**Claude** 或 **Codex**。
3. 閱讀 AI 的回答。對照 diff 自己檢查每一點。
4. 在 PR 頁面點擊 **Files changed**，然後點擊 **Review changes**（右上角；在某些版面配置下為 **Submit review**）。
5. 撰寫你的留言，選擇 **Comment**、**Approve** 或 **Request changes**，然後點擊 **Submit review**。

## AI 是你的助手，而不是審閱者

AI 按鈕會開啟一個與 AI 助手的對話。這個助手屬於你：它在你自己的帳戶中回答你，對話內容不會與 PR 作者或其他審閱者共享。它不會在 GitHub 上發布任何內容、不會核准任何內容，也不會修改任何程式碼。

審閱者是你。算數的是你以自己的名義在 GitHub 上提交的審查。因此：

- **複製之前先檢查。** AI 可能出錯。它可能憑空指出 diff 中不存在的問題，也可能漏掉真正的問題。打開它指出的檔案和行，自己確認。
- **用你自己的話寫。** 只貼上你檢查過並同意的要點。刪除其餘內容。
- **說明你沒有檢查什麼。** 「我讀了程式碼，但沒有執行」也是一份有用的審查。
- **切勿把機密貼到對話中。** 權杖、密碼和私人 URL 不應出現在 AI 對話或 PR 留言中。

## AI 審查按鈕如何運作

當有人開啟、重新開啟或編輯 PR 時，[AI 審查按鈕工作流程](../../../.github/workflows/ai-review-buttons.yml)會在 PR 描述末尾加入這一段：

> **Review this PR in**
> \[Grok\] \[Claude\] \[Codex\]

每個按鈕都是普通連結。它會在新分頁中開啟 AI 的網站，並且這段訊息已經預先輸入好了。

```text
Review this pull request. Read the title and diff at https://github.com/flisk-sh/tdk-cli-core/pull/123.
```

| 按鈕 | 開啟的網站 |
|---|---|
| **Grok** | grok.com |
| **Claude** | claude.ai |
| **Codex** | chatgpt.com |

選擇你平常使用的即可。它們收到的訊息都相同。每個網站可能會要求你登入；如果登入後對話框是空的，請再點一次按鈕。如果你尚未登入，請複製上面的訊息，填入 PR 的連結，然後貼到任何 AI 對話中。

需要注意的事項：

- **CI 中不會執行任何內容。** 工作流程只會把連結寫入描述。在你點擊之前，不會呼叫 AI。
- **你的文字是安全的。** 這一段會加在作者文字之後，且永遠不會更改作者的文字。如果作者同時正在編輯描述，工作流程會跳過更新，而不是覆寫他們的編輯。
- **按鈕不見了？** 編輯 PR 描述並儲存（任何小改動都可以），工作流程就會加入按鈕。維護者也可以在 **Actions** 分頁手動執行工作流程，為每個開啟中的 PR 加入按鈕。

### 提出更好的後續問題

第一次回答是摘要。提出後續問題，可以得到更有用的審查：

- 「哪個改動可能會破壞現有使用者？請指出檔案和行。」
- 「這個 diff 中有沒有缺少測試的地方？」
- 「PR 描述是否與程式碼的實際行為一致？」
- 「請像向新人解釋一樣，說明 `cli/src/commands/up.ts` 第 40–60 行。」
- 「請針對你確定的問題，寫一則簡短、友善的審查留言。」

### 合併衝突按鈕

如果 PR 與 `main` 發生衝突，[AI 衝突按鈕工作流程](../../../.github/workflows/ai-conflict-buttons.yml)會在 PR 上發布一則留言，其中包含 Grok、Claude 和 Codex 的 **Resolve conflict** 按鈕。這些按鈕會給 AI 逐步指示，讓它把 `main` 合併到分支並推送修正。如果 AI 無法推送到該分支（例如你不擁有的 fork），指示會告訴它改為推送到 `fix/<PR 編號>-conflict` 分支，並開啟一個替代 PR。如果原 PR 寫有 `Fixes #N`，替代 PR 也會寫。請像檢查其他改動一樣檢查結果，並在原 PR 上留言，附上替代 PR 的連結。衝突解決後，同一則留言會改為說明已解決，按鈕也會消失。

## 檢查什麼

你不必檢查所有內容。挑選你能檢查的部分，並說明你涵蓋了哪些。

- [ ] **它是否符合描述？** 將標題和 「What changed」 與 diff 進行比較。
- [ ] **是否只做一件聚焦的改動？** 無關的編輯應放在獨立的 PR 中。
- [ ] **有證據嗎？** 對於修正或行為改動，PR 應展示真實的前後輸出（參見[展示改動內容](03-open-a-pr-zh_tw.md#展示改動內容)）。
- [ ] **檢查是否通過？** 查看 **Conversation** 分頁底部的檢查項目。失敗的檢查需要修正或說明。
- [ ] **文件是否已更新？** 新增的選項或改變的指令，也需要更新文件。
- [ ] **是否有風險？** 機密資訊、已刪除的檔案、改變的預設值或新的相依套件，都值得提出疑問。
- [ ] **你能理解嗎？** 如果你作為新人無法理解程式碼，請直說。這同樣是有用的回饋。

## 在某些行上留言

1. 開啟 **Files changed** 分頁。
2. 將滑鼠移到某一行上，然後點擊出現的藍色 **+**。拖曳可以選取多行。
3. 輸入你的留言。
4. 點擊 **Start a review**（如果已經開始，則點擊 **Add review comment**）。這會讓你的留言在提交前保持為草稿，作者只會收到一次通知，而不是多次。

**Add single comment** 會立即發布。用於簡短的問題，而不是完整的審查。

若要提出精確的修正建議，請點擊留言框中的 **±** 圖示（**Insert a suggestion**），然後編輯區塊中的程式碼。作者可以一鍵套用。

## 提交審查

點擊 **Files changed** 右上角的 **Review changes**，撰寫摘要，然後選擇三個選項之一。

### Comment：不做決定的回饋

當你有問題或小的意見，或只檢查了 PR 的一部分時，請使用 **Comment**。

```markdown
Read the CLI changes; did not run them.

Question: what happens when `--port` is 0? The help text does not say.
```

### Approve：「可以了」，附帶備註

當你已檢查 PR 並認為可以合併時，使用 **Approve**。你可以在核准的同時留下小意見。請明確標示為選用，讓作者知道它們不會阻擋合併。

```markdown
Looks good. I ran `bun run test` on this branch and tried `flisk up --dry-run` in the restaurant example: the new URLs show up as described.

Optional (nit): `parsePort` could use a test for an empty string. Fine to do in a follow-up.
```

### Request changes：「還不行」，附上理由

當有內容必須在合併前修正時，使用 **Request changes**。這是在 GitHub 上拒絕 PR 的方式：它不會關閉 PR，而是告訴作者需要修正什麼。務必說明哪裡有問題、位於何處，以及怎樣才算符合要求。

```markdown
Thanks for this! Two things need fixing before merge:

1. `cli/src/commands/up.ts` line 52: the new flag is read but never passed to the generator, so `--no-cache` has no effect. Could you pass it through and add a test?
2. The README still shows the old flag name `--nocache`.

Everything else looks good. Happy to re-review once these are in.
```

當作者推送修正後，重新開啟 **Files changed**，檢查新的提交，然後提交一次新的審查。如果問題已修正，請選擇 **Approve**。你先前的 「changes requested」 會一直保留在 PR 上，直到你提交新的審查。

### 關閉 PR

要求修改並不等於關閉。只有維護者會關閉 PR，通常是在改動不會被接受，或作者停止回應時。如果你認為 PR 應該關閉，請在 **Comment** 中說明原因，並交由維護者決定。

## 撰寫友善、清楚的留言

- 既要說明什麼是好的，也要說明什麼有問題。
- 要具體：指出檔案和行，並解釋原因。
- 用提問代替命令：「Could this be…?」比「Change this.」更有效。
- 對小問題加上 `nit:` 或 `optional:` 標記，讓作者知道它們不會阻擋合併。
- 審查程式碼，而不是評判人。

每則留言都要遵守[行為準則](../../../CODE_OF_CONDUCT.md)。

## 透過終端機（選用）

使用 [GitHub CLI](https://cli.github.com)，你也可以在終端機中完成同樣的操作：

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

## 誰可以核准和合併

- 任何人都可以留言、核准或要求修改。每一次審查都能幫助維護者更快做出決定。
- 你不能核准自己的 PR。
- 只有[維護者](../../../MAINTAINERS.md)可以合併。在合併之前，他們會檢查審查情況，以及必要的檢查是否通過。

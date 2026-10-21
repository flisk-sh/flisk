# 4. pull request 리뷰하기

> 이 페이지는 [04-review-a-pr.md](../04-review-a-pr.md)의 번역입니다. 내용이 다르면 영어 버전이 우선합니다.

누구나 pull request를 리뷰할 수 있습니다. 모든 리뷰는 같은 규칙을 따릅니다.

1. 1차 확인에는 AI 리뷰 버튼을 사용하세요.
2. AI가 말하는 모든 내용을 diff와 직접 대조해 확인하세요.
3. GitHub에서 자신의 리뷰를 제출하고, 무엇을 확인했는지 말하세요.

제출하는 리뷰에 대한 책임은 AI가 아니라 여러분에게 있습니다.

## 첫 리뷰 전에: 필독 문서

리뷰하기 전에 아래를 읽으세요. 모두 합쳐 약 1시간이 걸리며, 한 번만 하면 됩니다. 이것을 읽지 않으면 AI의 의견이 맞는지 판단할 수 없습니다.

**TDK란 무엇인가**

- [ ] [README](../../../README.md): TDK가 무엇을 하는지, 사람들이 어떤 명령을 쓰는지.
- [ ] [프로젝트 개요](../../project-overview.md): Project → Stack → Resource 모델.
- [ ] [범위](../../scope.md): TDK가 무엇을 위한 것이며, 무엇을 위한 것이 아닌지.
- [ ] [생성 파일](../../generated-files.md): TDK가 쓰는 파일. 생성된 파일은 직접 편집하지 말고, 그것을 만드는 입력을 바꾸세요.

**우리가 일하는 방식**

- [ ] [기여 안내](../../../CONTRIBUTING.md): 라벨, issue 담당, DCO 서명.
- [ ] [1. 변경할 준비하기](01-first-change-ko.md): 언제 OpenSpec 제안서가 필요한지.
- [ ] [2. 변경 종류별 레시피](02-feature-recipes-ko.md): 코드가 어디에 있는지, 각 변경에 어떤 검사가 필요한지.
- [ ] [3. pull request 열기](03-open-a-pr-ko.md): 좋은 PR에 무엇이 있어야 하는지, 변경 전후 증거를 포함해서.

**모두가 지키는 규칙**

- [ ] [행동 강령](../../../CODE_OF_CONDUCT.md): 리뷰에서 서로 어떻게 말하는지.
- [ ] [보안 정책](../../../SECURITY.md): 보안 문제는 비공개로 보고하고, PR 댓글에 절대 쓰지 마세요.
- [ ] [거버넌스](../../../GOVERNANCE.md)와 [메인테이너](../../../MAINTAINERS.md): 누가 결정하고 누가 병합하는지.

그다음 한 번 시도해 보세요. [빠른 설정](../../../CONTRIBUTING.md#quick-setup)을 실행하면 PR을 체크아웃하고 직접 검사를 실행할 수 있습니다.

## 요약

1. GitHub에서 PR을 열고 설명의 끝까지 스크롤하세요.
2. **Review this PR in** 아래의 **Grok**, **Claude**, **Codex** 중 하나를 클릭하세요.
3. AI의 답변을 읽고, 각 항목을 diff와 대조해 직접 확인하세요.
4. PR에서 **Files changed**를 클릭한 다음, **Review changes**(오른쪽 위; 일부 화면에서는 **Submit review**)를 클릭하세요.
5. 댓글을 쓰고 **Comment**, **Approve**, **Request changes** 중 하나를 선택한 뒤 **Submit review**를 클릭하세요.

## AI는 리뷰어가 아니라 여러분의 도우미입니다

AI 버튼은 AI 어시스턴트와의 채팅을 엽니다. 그 어시스턴트는 여러분의 것입니다. 여러분의 계정에서 여러분에게 답하며, 그 채팅은 PR 작성자나 다른 리뷰어와 공유되지 않습니다. GitHub에 아무것도 게시하지 않고, 승인하지 않으며, 코드도 바꾸지 않습니다.

리뷰어는 여러분입니다. 여러분의 이름으로 GitHub에 제출한 리뷰가 중요합니다. 그래서:

- **복사하기 전에 확인하세요.** AI는 틀릴 수 있습니다. diff에 없는 문제를 만들어내거나, 실제 문제를 놓칠 수 있습니다. AI가 가리키는 파일과 줄을 열어 직접 확인하세요.
- **자신의 말로 쓰세요.** 확인하고 동의한 내용만 붙여 넣으세요. 나머지는 지우세요.
- **확인하지 않은 것을 말하세요.** "코드는 읽었지만 실행하지는 않았습니다"도 유용한 리뷰입니다.
- **채팅에 비밀 정보를 붙여 넣지 마세요.** 토큰, 비밀번호, 비공개 URL은 AI 채팅에도 PR 댓글에도 들어가면 안 됩니다.

## AI 리뷰 버튼의 동작 방식

누군가 PR을 열거나, 다시 열거나, 편집하면 [AI 리뷰 버튼 워크플로](../../../.github/workflows/ai-review-buttons.yml)가 PR 설명 끝에 이 섹션을 추가합니다.

> **Review this PR in**
> \[Grok\] \[Claude\] \[Codex\]

각 버튼은 단순한 링크입니다. AI 웹사이트를 새 탭에서 열고, 이 메시지가 미리 입력되어 있습니다.

```text
Review this pull request. Read the title and diff at https://github.com/flisk-sh/tdk-cli-core/pull/123.
```

| 버튼 | 여는 곳 |
|---|---|
| **Grok** | grok.com |
| **Claude** | claude.ai |
| **Codex** | chatgpt.com |

평소 쓰는 것을 고르세요. 모두 같은 메시지를 받습니다. 각 사이트는 로그인을 요구할 수 있습니다. 로그인 후 채팅창이 비어 있으면 버튼을 다시 클릭하세요. 로그인하지 않았다면 위 메시지를 복사해서 PR 링크를 넣고 아무 AI 채팅에나 붙여 넣으세요.

참고할 점:

- **CI에서는 아무것도 실행되지 않습니다.** 워크플로는 링크를 설명에 쓰기만 합니다. 클릭하기 전까지 AI가 호출되지 않습니다.
- **여러분의 글은 안전합니다.** 이 섹션은 작성자의 글 뒤에 추가되며 그 글을 바꾸지 않습니다. 작성자가 같은 순간 설명을 편집하고 있다면, 워크플로는 덮어쓰지 않고 업데이트를 건너뜁니다.
- **버튼이 없나요?** PR 설명을 편집해서 저장하세요(아주 작은 변경이면 됩니다). 그러면 워크플로가 버튼을 추가합니다. 메인테이너는 **Actions** 탭에서 워크플로를 수동으로 실행해 열린 모든 PR에 버튼을 추가할 수도 있습니다.

### 더 나은 후속 질문하기

첫 답변은 요약입니다. 더 유용한 리뷰를 얻으려면 후속 질문을 하세요.

- "기존 사용자를 깨뜨릴 수 있는 변경은 무엇인가요? 파일과 줄을 보여주세요."
- "이 diff에서 테스트가 빠진 부분이 있나요?"
- "PR 설명이 코드가 실제로 하는 일과 일치하나요?"
- "`cli/src/commands/up.ts` 40~60행을 프로젝트에 처음 온 사람에게 설명하듯 해 주세요."
- "확실한 문제들에 대해 짧고 친절한 리뷰 댓글을 써 주세요."

### 병합 충돌 버튼

PR이 `main`과 충돌하면 [AI 충돌 버튼 워크플로](../../../.github/workflows/ai-conflict-buttons.yml)가 Grok, Claude, Codex용 **Resolve conflict** 버튼이 있는 댓글을 PR에 하나 올립니다. 이 버튼은 AI에게 `main`을 브랜치에 병합하고 수정 사항을 push하는 단계별 지침을 줍니다. AI가 해당 브랜치에 push할 수 없으면(예: 여러분이 소유하지 않은 포크), 지침은 대신 `fix/<PR 번호>-conflict` 브랜치에 push하고 대체 PR을 열도록 안내합니다. 원래 PR에 `Fixes #N`이 있다면 대체 PR에도 같은 내용이 적힙니다. 결과는 다른 변경과 같은 방식으로 확인하고, 원래 PR에 대체 PR 링크를 댓글로 남기세요. 충돌이 해결되면 같은 댓글이 그렇게 바뀌고 버튼은 사라집니다.

## 무엇을 볼지

모든 것을 확인할 필요는 없습니다. 할 수 있는 부분을 고르고, 확인한 범위를 말하세요.

- [ ] **설명대로 동작하나요?** 제목과 "What changed"를 diff와 비교하세요.
- [ ] **하나에 집중된 변경인가요?** 관련 없는 편집은 별도의 PR이어야 합니다.
- [ ] **증거가 있나요?** 수정이나 동작 변경이라면 PR에 실제 변경 전후 출력이 있어야 합니다([변경 내용 보여주기](03-open-a-pr-ko.md#변경-내용-보여주기) 참고).
- [ ] **검사가 통과했나요?** **Conversation** 탭 아래쪽의 검사를 보세요. 실패한 검사는 수정하거나 설명해야 합니다.
- [ ] **문서가 업데이트되었나요?** 새 옵션이나 바뀐 명령은 문서도 바뀌어야 합니다.
- [ ] **위험한 부분이 있나요?** 비밀 정보, 삭제된 파일, 바뀐 기본값, 새 의존성은 질문할 가치가 있습니다.
- [ ] **이해할 수 있나요?** 신입으로서 코드를 따라갈 수 없다면 그렇다고 말하세요. 그것도 유용한 피드백입니다.

## 줄에 댓글 달기

1. **Files changed** 탭을 엽니다.
2. 줄 위에 마우스를 올리고 나타나는 파란색 **+**를 클릭합니다. 드래그하면 여러 줄을 선택할 수 있습니다.
3. 댓글을 입력합니다.
4. **Start a review**(이미 시작했다면 **Add review comment**)를 클릭합니다. 제출할 때까지 댓글이 초안으로 남아, 작성자는 여러 번이 아니라 한 번만 알림을 받습니다.

**Add single comment**는 즉시 게시됩니다. 짧은 질문에 쓰고, 전체 리뷰에는 쓰지 마세요.

정확한 수정안을 제시하려면 댓글 상자의 **±** 아이콘(**Insert a suggestion**)을 클릭하고 블록 안의 코드를 편집하세요. 작성자는 한 번의 클릭으로 적용할 수 있습니다.

## 리뷰 제출하기

**Files changed** 오른쪽 위의 **Review changes**를 클릭하고, 요약을 쓴 다음 세 가지 옵션 중 하나를 고르세요.

### Comment: 결정 없는 피드백

질문이나 작은 메모가 있을 때, 또는 PR의 일부만 확인했을 때 **Comment**를 사용하세요.

```markdown
Read the CLI changes; did not run them.

Question: what happens when `--port` is 0? The help text does not say.
```

### Approve: "준비되었습니다", 메모와 함께

PR을 확인했고 병합해도 좋다고 판단했을 때 **Approve**를 사용하세요. 승인하면서도 작은 댓글을 남길 수 있습니다. 이때는 작성자가 병합을 막지 않는다는 것을 알 수 있도록 선택 사항이라고 분명히 표시하세요.

```markdown
Looks good. I ran `bun run test` on this branch and tried `tdk up --dry-run` in the restaurant example: the new URLs show up as described.

Optional (nit): `parsePort` could use a test for an empty string. Fine to do in a follow-up.
```

### Request changes: "아직은 안 됩니다", 이유와 함께

병합 전에 반드시 고쳐야 할 것이 있을 때 **Request changes**를 사용하세요. GitHub에서 PR을 거절하는 방법입니다. PR을 닫지는 않고, 작성자에게 무엇을 고쳐야 하는지 알려줍니다. 무엇이 잘못됐는지, 어디인지, 무엇이 있으면 괜찮아지는지를 항상 말하세요.

```markdown
Thanks for this! Two things need fixing before merge:

1. `cli/src/commands/up.ts` line 52: the new flag is read but never passed to the generator, so `--no-cache` has no effect. Could you pass it through and add a test?
2. The README still shows the old flag name `--nocache`.

Everything else looks good. Happy to re-review once these are in.
```

작성자가 수정 사항을 push하면 **Files changed**를 다시 열고 새 커밋을 확인한 뒤 새 리뷰를 제출하세요. 문제가 해결되었다면 **Approve**를 선택하세요. 이전의 "changes requested"는 새 리뷰를 제출할 때까지 PR에 남아 있습니다.

### PR 닫기

변경 요청은 닫는 것과 다릅니다. PR을 닫는 것은 메인테이너만 하며, 보통 변경이 받아들여지지 않을 때나 작성자가 응답을 멈췄을 때입니다. PR을 닫아야 한다고 생각하면 **Comment**로 이유를 말하고 메인테이너가 결정하도록 하세요.

## 친절하고 명확한 댓글 쓰기

- 잘못된 점뿐 아니라 좋은 점도 말하세요.
- 구체적으로 쓰세요. 파일과 줄을 짚고 이유를 설명하세요.
- 명령하기보다 질문하세요. "Change this."보다 "Could this be…?"가 더 효과적입니다.
- 사소한 것에는 `nit:` 또는 `optional:`을 붙여서 병합을 막지 않는다는 것을 알려 주세요.
- 사람이 아니라 코드를 리뷰하세요.

모든 댓글에서 [행동 강령](../../../CODE_OF_CONDUCT.md)을 따르세요.

## 터미널에서 (선택 사항)

[GitHub CLI](https://cli.github.com)를 사용하면 터미널에서도 같은 작업을 할 수 있습니다.

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

## 승인과 병합은 누가 할 수 있나요

- 누구나 댓글, 승인, 변경 요청을 할 수 있습니다. 모든 리뷰는 메인테이너가 더 빨리 결정하도록 돕습니다.
- 자신의 PR은 승인할 수 없습니다.
- 병합은 [메인테이너](../../../MAINTAINERS.md)만 합니다. 병합 전에 메인테이너는 리뷰와 필수 검사가 통과했는지 확인합니다.

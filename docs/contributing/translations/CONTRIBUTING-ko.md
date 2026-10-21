# Flisk에 기여하기

[English](../../../CONTRIBUTING.md) | [简体中文](CONTRIBUTING-zh_cn.md) | [繁體中文](CONTRIBUTING-zh_tw.md) | [日本語](CONTRIBUTING-ja.md) | 한국어

> 이 페이지는 [CONTRIBUTING.md](../../../CONTRIBUTING.md)의 번역입니다. 내용이 다르면 영어 버전이 기준입니다. 링크된 가이드는 현재 영어로만 제공됩니다.

환영합니다! 작은 수정도 큰 기능도 모두 도움이 됩니다. 먼저 짧은 [기여자 가이드](../README.md)부터 시작하세요. 바꿀 내용을 찾고, 수정하고, 확인하고, pull request를 여는 과정을 차례로 안내합니다.

## 여기서 시작하세요

1. [변경할 내용을 고르고 저장소를 준비합니다](../01-first-change.md).
2. [변경 종류에 맞는 절차를 따릅니다](../02-feature-recipes.md).
3. [작업을 확인하고 pull request를 엽니다](../03-open-a-pr.md).
4. [다른 사람의 pull request를 리뷰합니다](../04-review-a-pr.md). 원클릭 AI 리뷰 버튼을 사용할 수 있습니다.

[프런트엔드 provider 가이드](../../frontend-framework-providers.md)에는 Vue 같은 다른 Vite 프레임워크를 추가하는 정확한 단계가 있습니다. [백엔드 provider 가이드](../../backend-language-providers.md)는 Python 같은 백엔드 언어를 추가하는 방법을 다룹니다.

## 빠른 설정

Git, [Bun](https://bun.sh), Node.js 22.12+가 필요합니다. 대부분의 변경에는 Docker와 Tilt가 필요하지 않습니다.

```bash
git clone https://github.com/flisk-sh/flisk.git
cd flisk
bun install
bun run typecheck && bun run lint && bun run test   # 약 1분; 무엇이든 바꾸기 전에 모두 통과해야 합니다
```

깨끗한 체크아웃에서 이 중 하나가 실패하면, 그것은 여러분의 환경 문제가 아니라 프로젝트의 버그입니다. [이슈를 열어 주세요](https://github.com/flisk-sh/flisk/issues/new/choose).

## 버그 찾기

코드를 쓰지 않아도 도울 수 있습니다. 명령을 실행하고, 출력된 내용을 Flisk가 약속한 것(`--help`, 문서, 또는 다른 명령)과 비교해 차이가 있으면 보고하세요. 그것이 버그입니다.

[Flisk에서 버그 찾기](../finding-bugs.md)에 정확한 단계가 있습니다. 테스트용 임시 프로젝트, 예상 출력이 포함된 명령 체크리스트, 과거에 버그를 찾아낸 패턴, 그리고 메인테이너가 바로 처리할 수 있는 보고 형식입니다. 예를 들어 `flisk networks`는 URL을 하나도 보여 주지 않는데 `flisk up --dry-run`은 보여 준다면, 두 명령이 서로 맞지 않으므로 둘 중 하나가 틀린 것입니다.

## pull request 리뷰하기

열려 있는 [pull request](https://github.com/flisk-sh/flisk/pulls)를 리뷰하면 코드를 쓰지 않고도 도울 수 있습니다. 모든 PR 끝에는 **Grok**, **Claude**, **Codex** 버튼이 있으며, 이 버튼을 누르면 해당 PR 리뷰를 이미 요청한 AI 채팅이 열립니다. AI는 여러분의 도우미입니다. AI가 말한 내용을 diff와 대조해 확인한 다음, GitHub에서 **Comment**, **Approve**, **Request changes** 중 하나로 여러분 자신의 리뷰를 제출하세요.

첫 리뷰 전에 [필수 문서](../04-review-a-pr.md#before-your-first-review-required-reading)를 읽으세요(약 1시간, 한 번만). 그다음 [pull request 리뷰하기](../04-review-a-pr.md)에서 버튼 사용법을 단계별로 설명하고, 승인할 때와 변경을 요청할 때의 댓글 예시를 보여 줍니다.

## 할 일 찾기

- 🗺️ [Flisk 여정](../../journey/README.md): 섬을 고르고, 퀘스트를 완료하고, 랭크를 올리세요(8 kyu → 1 dan)
- [Good first issues](https://github.com/flisk-sh/flisk/labels/good%20first%20issue)
- [Help wanted](https://github.com/flisk-sh/flisk/labels/help%20wanted)
- 단계별 체크리스트로 [버그 찾기](../finding-bugs.md)
- [버그 보고 또는 질문하기](https://github.com/flisk-sh/flisk/issues/new/choose)

이슈를 골랐다면 `I'll take this`(또는 `I would like this one`, `I'd like to work on this`, `Can I take this?`)라고 댓글을 남기세요. 봇이 여러분을 담당자로 지정하고 `claimed` 라벨을 붙여 두 사람이 같은 작업을 하지 않도록 합니다. pull request 없이 14일이 지나면 알림이 가고, 21일이 지나면 해제됩니다. 초안 PR도 진행으로 인정됩니다. 버그를 보고할 때는 가능하면 `flisk doctor` 출력을 함께 넣어 주세요.

## 맞춤법 검사

`cargo install typos-cli --version 1.50.3`으로 버전이 고정된 검사기를 설치한 다음, 저장소 루트에서 `typos`를 실행해 맞춤법을 검사하세요.

## 라벨

라벨로 관심사와 경험에 맞는 작업을 찾으세요. 메인테이너는 분류할 때 라벨을 붙이고, 이슈 양식과 PR labeler도 일부 라벨을 자동으로 붙입니다. 최신 [라벨 목록](https://github.com/flisk-sh/flisk/labels)에서 각 라벨의 설명을 볼 수 있습니다.

| 라벨 | 의미 | 붙는 시점 |
| --- | --- | --- |
| `bug` | 예상대로 동작하지 않는 것. | 버그 보고 양식과 확인된 결함. |
| `enhancement` | 기능 추가 또는 개선. | 기능 요청 양식과 채택된 개선. |
| `documentation` | 빠졌거나, 틀렸거나, 불분명한 문서. | 문서 양식과 문서 작업. |
| `good first issue` | 저장소 지식이 거의 필요 없는 작고 독립적인 작업. | 메인테이너가 첫 기여로 적합하다고 판단한 것. |
| `help wanted` | 커뮤니티의 도움이 필요한 작업. 보통 first issue보다 큽니다. | 메인테이너가 맡아 줄 사람을 환영하는 것. |
| `difficulty: easy`, `difficulty: medium`, `difficulty: hard` | 몇 시간, 하루나 이틀, 또는 저장소에 대한 깊은 지식이나 설계가 필요한 작업. | 메인테이너가 난이도를 추정한 것. 기여자 라벨을 보완합니다. |
| `question` | 설명을 요청하는 것. | 메인테이너가 구현 작업이 아니라 질문으로 분류한 것. |
| `duplicate` | 다른 이슈나 PR이 이미 다루는 작업. | 메인테이너가 원래 논의를 링크합니다. |
| `invalid`, `wontfix` | 유효하지 않은 보고, 또는 프로젝트가 하지 않을 작업. | 메인테이너가 진행하지 않는 이유를 설명합니다. |
| `premium` | Premium 라이선스 요청과 유료 기능. | premium 이슈 양식 또는 메인테이너 분류. |
| `tracking` | 관련 작업을 묶는 상위 이슈. | 메인테이너가 여러 이슈에 걸친 작업을 묶을 때. |
| `community`, `examples`, `growth` | 커뮤니티 활동, 예제 프로젝트, 도입 확대를 위한 개선. | 메인테이너가 홍보 및 도입 관련 작업을 식별한 것. |
| `dx`, `design`, `guide` | 개발자 경험, 시각 또는 UX 다듬기, 문서 가이드. | 메인테이너가 개선 종류를 식별한 것. |
| `testing`, `ci`, `packaging` | 테스트, GitHub Actions, 설치 프로그램과 패키지. | 메인테이너가 검증 및 배포 작업을 식별한 것. |
| `agents` | AI 코딩 에이전트를 위한 문서와 파일. | 메인테이너가 에이전트 대상 작업을 식별한 것. |
| `rfc` | 구현 전 설계 논의. | 메인테이너가 제안 범위에 대한 합의를 요청할 때. |
| `windows` | Windows 및 WSL2 지원. | 메인테이너가 플랫폼별 작업을 식별한 것. |
| `performance`, `benchmark` | 속도나 메모리 개선, 또는 측정 도구. | 메인테이너가 최적화 및 측정 작업을 식별한 것. |
| `hacktoberfest` | Hacktoberfest에 참여하는 작업. | 메인테이너가 이벤트 대상 기여를 선택한 것. |
| `area:*` | 영향을 받는 부분. 예: `area: tui`, `area: doctor`, `area: cli`. | 메인테이너가 이슈에 붙입니다. PR labeler는 변경된 경로로 영역을 정합니다. |
| `tech:*` | 관련 기술. 예: TypeScript, Docker, Tilt. | 메인테이너가 작업에 관련된 도구를 식별한 것. |
| `rank:*`, `island:*` | Flisk 여정에서의 작업 규모와 주제. | 메인테이너가 퀘스트를 기여자 지도에 배치한 것. |
| `event:*` | GitHub Universe 같은 특정 이벤트를 위한 작업. | 메인테이너가 이벤트별 작업을 정리한 것. |

## 커밋에 서명하기

모든 커밋에는 [Developer Certificate of Origin](../../../DCO) 서명이 필요합니다. `git commit -s`로 추가하면 `Signed-off-by: Your Name <you@example.com>`이 붙습니다. 기존 커밋을 고치려면 `git rebase --signoff origin/main`을 실행하고 브랜치를 force-push하세요. 이 줄이 없는 커밋이 있으면 pull request 검사가 실패합니다.

## 도입 팀 목록에 팀 추가하기

여러분의 저장소에서 Flisk를 사용하고 있나요? 두 가지 방법으로 [ADOPTERS.md](../../../ADOPTERS.md)에 등록할 수 있습니다. [We use Flisk](https://github.com/flisk-sh/flisk/issues/new?template=we-use-flisk.yml) 이슈 양식을 열거나, pull request로 표에 행을 추가하세요. [What counts](../../../ADOPTERS.md#what-counts)에서 무엇을 링크해야 하는지, 무엇이 해당하지 않는지 설명합니다.

## 거버넌스

결정 방식과 메인테이너 추가 방법은 [GOVERNANCE.md](../../../GOVERNANCE.md), 병합 권한이 있는 사람은 [MAINTAINERS.md](../../../MAINTAINERS.md), Flisk를 사용하는 팀은 [ADOPTERS.md](../../../ADOPTERS.md)를 참고하세요.

## 친절하게

참여함으로써 [행동 강령](../../../CODE_OF_CONDUCT.md)을 따르는 데 동의하게 됩니다. 보안 문제는 공개 이슈가 아니라 [SECURITY.md](../../../SECURITY.md)에 따라 비공개로 보고해 주세요.

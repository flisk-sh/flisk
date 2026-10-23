# 1. 변경할 준비하기

> 이 페이지는 [01-first-change.md](../01-first-change.md)의 번역입니다. 내용이 다르면 영어 버전이 우선합니다.

저장소 전체를 이해할 필요는 없습니다. 작은 변경 하나를 고르고, 맞는 레시피를 따라가세요. 단계가 불분명하면 issue에 질문하세요.

다음 단계는 한 번만 하면 됩니다. Flisk CLI와 검사에 필요한 도구를 준비합니다.

## 가장 빠른 방법: Dev Container / Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/flisk-sh/flisk?quickstart=1)
[![Open in Dev Containers](https://img.shields.io/badge/Open%20in-Dev%20Containers-blue?logo=visualstudiocode)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/flisk-sh/flisk)
[![Open in Gitpod](https://img.shields.io/badge/Open%20in-Gitpod-908a00?logo=gitpod)](https://gitpod.io/#https://github.com/flisk-sh/flisk)
[![Open in Firebase Studio](https://img.shields.io/badge/Open%20in-Firebase%20Studio-4285F4?logo=firebase)](https://idx.google.com/import?url=https://github.com/flisk-sh/flisk)
[![Open in Replit](https://img.shields.io/badge/Open%20in-Replit-F26207?logo=replit)](https://replit.com/github/flisk-sh/flisk)
[![Open in DevPod](https://img.shields.io/badge/Open%20in-DevPod-1C1C1C?logo=devpod)](https://devpod.sh/open#https://github.com/flisk-sh/flisk)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-1269D3?logo=stackblitz)](https://stackblitz.com/github/flisk-sh/flisk)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-151515?logo=codesandbox)](https://codesandbox.io/p/github/flisk-sh/flisk)

또는 저장소를 클론한 뒤 VS Code에서 **Dev Containers: Reopen in Container**를 실행하세요.

기본 컨테이너에는 Node.js 22와 Bun이 들어 있고, 시작 후 `bun install`을 자동으로 실행합니다. 시작 직후 바로 다음을 실행할 수 있습니다.

```bash
bun run typecheck
bun run lint
bun run test
```

Docker와 Tilt는 선택 사항이며 기본 컨테이너에 포함되지 않습니다. Flisk 서비스나 전체 로컬 환경을 실행해야 할 때만 추가하세요.

## 필요한 것 (로컬 설치)

- Git
- [Bun](https://bun.sh)
- Node.js 22.12 이상
- Flisk 서비스를 실행하거나 전체 로컬 환경을 확인해야 할 때만 Docker와 [Tilt](https://docs.tilt.dev/install.html)

## 저장소를 컴퓨터에 복사하기

터미널을 열고 다음을 실행하세요.

```bash
git clone https://github.com/flisk-sh/flisk.git
cd flisk
bun install
git switch -c my-change
```

`my-change`는 짧은 이름으로 바꾸세요. 예: `docs-new-framework-guide`.

## 변경 하나 찾기

1. [good first issue](https://github.com/flisk-sh/flisk/labels/good%20first%20issue) 또는 [help wanted issue](https://github.com/flisk-sh/flisk/labels/help%20wanted)를 여세요.
2. issue를 읽고 이미 누군가 작업 중인지 확인하세요.
3. `I'll take this`(또는 `I would like this one`)라고 댓글을 다세요. 봇이 담당자로 지정하고 `claimed` 라벨을 붙입니다. issue가 없다면 큰 기능을 시작하기 전에 변경 내용을 설명하는 issue를 여세요.
4. [기능 레시피](02-feature-recipes-ko.md)를 사용해 수정할 가능성이 있는 파일과 검사를 찾으세요.

## 변경 제안서를 작성할 때

사용자에게 보이는 계약, manifest나 생성 형식, 또는 여러 하위 시스템에 영향을 주는 변경에는 OpenSpec을 사용하세요. [Vue provider 변경](../../../openspec/changes/archive/2026-09-28-add-vue-frontend-adapter/proposal.md)은 proposal, design, specs, tasks를 모두 갖춘 완료된 예입니다. 컴퓨터에 `openspec` 명령이 설치되어 있지 않다면, 여러 부분에 걸친 변경을 시작하기 전에 issue에서 물어보세요.

저장소 루트에서 다음을 실행하세요.

```bash
openspec list
openspec new change "short-change-name"
openspec status --change "short-change-name"
```

OpenSpec이 출력하는 안내에 따라 필요한 proposal, design, specs, tasks를 작성하세요. 오타 수정, 링크 수정, 작고 독립적인 변경에는 보통 제안서가 필요하지 않습니다.

## 간단한 검사 실행하기

저장소 루트에서 CLI 검사는 다음과 같습니다.

```bash
bun run typecheck
bun run lint
bun run test
```

마지막 편집 후 검사를 다시 실행하세요. 검사가 실패하면 그 실패 내용을 PR에 포함하고, 무엇을 시도했는지 적으세요. 영역별 검사는 [PR 가이드](03-open-a-pr-ko.md)를 참고하세요.

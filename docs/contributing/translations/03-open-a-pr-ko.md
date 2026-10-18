# 3. 변경 확인하고 pull request 열기

> 이 페이지는 [03-open-a-pr.md](../03-open-a-pr.md)의 번역입니다. 내용이 다르면 영어 버전이 우선합니다.

## 변경에 맞는 검사 실행하기

별도로 명시되지 않는 한 저장소 루트에서 검사를 실행하세요.

| 변경 | 실행할 검사 |
|---|---|
| CLI 코드 또는 생성되는 CLI 동작 | `bun run typecheck`, `bun run lint`, `bun run test` |
| CLI 테스트에서 사용하는 엔진/Starlark 생성기 | `bun run typecheck`, `bun run lint`, `cd cli && TDK_REQUIRE_TILT=1 npm test`를 실행하세요. CI 테스트 작업은 Tilt를 설치하고 이 플래그를 설정합니다. |
| Python 엔진 테스트 영역 | 한 번 `python3 -m pip install -r tests/requirements.txt`로 테스트 패키지를 설치한 뒤, 관련 테스트 파일을 `pytest`로 실행하거나 해당 스위트에서는 `make test-tilt-engine`을 실행하세요. 일부 테스트는 깨끗한 체크아웃에서도 실패합니다. 어떤 테스트가 왜 실패하는지는 #700을 보세요. 이 Python 검사는 `.github/workflows/ci.yml`에서 실행되지 않습니다. |
| 문서만 변경 | 바꾼 링크와 명령을 확인하세요. 초보자의 시선으로 페이지를 한 번 읽어보세요. |

실제로 실행하지 않은 검사는 통과했다고 말하지 마세요. 검사를 실행할 수 없다면 그 사실과 이유를 적으세요.

### 골든 출력 테스트가 실패하는 경우

세 개의 샘플 프로젝트에서 생성된 Tilt 및 Compose 파일은 `cli/src/generator/__tests__/golden/`에 커밋된 사본과 비교됩니다. `cli/templates/` 또는 생성기를 의도적으로 바꿨다면 테스트가 실패하면서 변경된 각 파일의 이름을 알려줍니다. `UPDATE_GOLDEN=1 bun run test -- golden-generated-output`을 실행해 변경을 수용하고, golden 파일의 diff를 읽은 뒤 변경과 함께 커밋하세요. 생성 출력을 바꿀 의도가 없었다면 파일을 업데이트하지 말고 원인을 고치세요. 기존 프로젝트도 같은 바이트 변화를 보므로, 다음 `tdk config regenerate` 전까지 `tdk config verify`가 불일치를 보고합니다. 이 점을 PR에 밝히세요.

## 변경 내용 보여주기

버그 수정이나 동작 변경이라면 가능한 한 `main`과 내 브랜치에서 같은 단계를 실행하세요. 실제 변경 전후 출력을 붙여 넣고, 기억에서 재구성하지 마세요. 명령, 프로젝트 또는 픽스처, 재현에 필요한 설정을 포함하세요. issue에 언급된 빈 상태, 오류 상태, 복구 상태도 다루세요.

빌드된 CLI 진입점을 테스트한다면 오래된 컴파일 파일을 쓰지 않도록 먼저 `bun run build`를 실행하세요. `tdk ui` 같은 대화형 명령은 실제 터미널에서 확인하세요. 자동화 테스트가 없다면 이유를 설명하고 테스트를 추가할 issue를 연결하세요. 새 동작과 버그 수정에는 같은 pull request에 테스트가 필요합니다. 자세한 내용은 [CONTRIBUTING.md의 테스트](../../../CONTRIBUTING.md#tests)를 보세요.

## 브랜치 push하기

저장소에 쓰기 권한이 있다면:

```bash
git add path/to/your/files
git commit -m "Describe the change"
git push -u origin my-change
```

포크에서 기여한다면 포크에 push한 뒤 그 브랜치에서 pull request를 여세요.

## pull request 열기

GitHub에서 저장소로 이동하세요. 브랜치의 **Compare & pull request**를 클릭하거나 **Pull requests → New pull request**를 선택하세요. 기본 브랜치로 `main`을 선택하고 다음을 채우세요.

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

해당하지 않는 체크리스트 항목은 삭제하세요. 리뷰어가 변경을 이해하는 데 도움이 되면 스크린샷이나 실제 터미널 출력을 추가하세요. 비밀번호, 토큰, 비공개 URL, 개인 파일 경로는 절대 포함하지 마세요.

## "Create pull request"를 클릭하기 전에

- [ ] PR이 하나의 주요 작업만 합니다.
- [ ] issue를 연결했거나 변경이 유용한 이유를 설명했습니다.
- [ ] 변경의 영향을 받는 문서나 예제를 업데이트했습니다.
- [ ] 실제로 실행한 검사를 나열하고 빠진 부분을 적었습니다.
- [ ] 동작이 바뀌었다면 변경 전후 증거를 포함했습니다.

PR을 열면 GitHub이 CI를 실행합니다. 검사가 실패하면 로그를 읽고, 같은 브랜치에서 수정한 뒤 다시 push하세요. PR은 자동으로 업데이트됩니다. 그다음 PR에서 리뷰어의 질문에 답하세요.

GitHub은 PR 설명 끝에 **Grok**, **Claude**, **Codex** 버튼도 추가합니다. 하나를 클릭하면 다른 사람이 보기 전에 자신의 PR에 대해 AI 리뷰를 받을 수 있습니다. [pull request 리뷰하기](04-review-a-pr-ko.md)에서 버튼 동작과 리뷰어가 승인하거나 변경을 요청하는 방법을 설명합니다.

## GitHub이 실행하는 것

[PR 템플릿](../../../.github/pull_request_template.md)은 변경한 영역을 선택하도록 요청하고, 영역별 짧은 안내를 엽니다. GitHub은 변경된 경로에 따라 일치하는 `area:*` 라벨을 추가하고, 업데이트된 diff를 push하면 오래된 영역 라벨을 제거합니다. 라벨은 PR을 정리할 뿐이며, 어떤 자동화가 실행될지는 워크플로 경로 규칙이 결정합니다.

- **모든 pull request:** [CI](../../../.github/workflows/ci.yml)가 lint, typecheck, CLI 테스트, 패키지 스모크 검사를 실행합니다. 추가 CI 작업은 변경된 파일이나 저장소 설정에 따라 실행될 수 있습니다.
- **런타임 파일이 변경된 경우:** PR이 `cli/`, `engine/`, `discovery/` 아래 파일이나 `Tiltfile`, `package.json`, 해당 워크플로 파일을 바꾸면 Quickstart E2E도 실행됩니다.
- **프레임워크 예제:** Vue, React 또는 다른 provider를 추가하면 `cli/`와 `engine/`이 바뀌므로, 항상 실행되는 CI와 Quickstart E2E가 모두 실행됩니다.
- **문서만 변경:** 항상 실행되는 CI는 여전히 실행됩니다. Quickstart E2E는 PR이 나열된 경로 중 하나를 함께 바꾸지 않는 한 실행되지 않습니다.

그 밖의 예제 앱과 100개 서비스 픽스처 벤치 검사는 PR마다가 아니라 일정에 따라 또는 수동 요청으로 실행됩니다. 각 워크플로의 트리거 경로는 `.github/workflows/`의 파일 상단에서 확인할 수 있습니다.

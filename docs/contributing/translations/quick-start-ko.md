# 기여자를 위한 빠른 시작 가이드

> 이 페이지는 [quick-start.md](../quick-start.md)의 번역입니다. 내용이 다르면 영어 원본이 우선합니다.

새로 저장소를 복제한 시점부터 첫 테스트 통과 및 풀 리퀘스트 생성까지 약 5분 만에 완료할 수 있습니다. 자세한 단계별 안내는 [변경할 준비하기](01-first-change-ko.md)를 참고하세요.

## 먼저 인사 나누기

[Flisk Discord](https://discord.gg/qMu5Xn8Kaq)에 참여하여 어떤 작업에 기여하고 싶은지 알려주세요. 메인테이너가 첫 작업 선정을 돕고 개발 환경 설정 중 발생하는 질문에 답변해 드립니다.

## 1. 사전 요구사항

- [Git](https://git-scm.com/)
- [Bun](https://bun.sh)
- [Node.js](https://nodejs.org/) 22.12 이상
- [Docker](https://docs.docker.com/get-docker/) 및 [Tilt](https://docs.tilt.dev/install.html) (로컬 전체 스택을 실행하려는 경우에만 필요하며, 대부분의 기여 작업에는 필요하지 않습니다)

## 2. 저장소 복제 및 의존성 설치

GitHub에서 저장소를 포크한 후 다음 명령어를 실행합니다:

```bash
git clone https://github.com/<your-username>/flisk.git
cd flisk
bun install
git switch -c my-change
```

## 3. 테스트 실행

```bash
npm --prefix cli test
```

CI 환경은 Docker와 Tilt가 설치된 Linux에서 이 테스트를 실행합니다. 해당 도구가 없는 환경에서는 스택을 시작하거나 검사하는 일부 테스트가 실패할 수 있습니다. 변경 사항으로 인한 문제인지 확인하기 전에 `main` 브랜치의 최신 CI 실행 결과와 비교해 보세요.

## 4. 린터 실행

```bash
npm --prefix cli run lint
```

## 5. CLI 빌드

```bash
npm --prefix cli run build
```

## 6. 빌드 결과 확인

```bash
node cli/bin/flisk.js --help
```

## 7. 시스템 환경 검사

```bash
node cli/bin/flisk.js doctor
```

`doctor` 명령은 Docker, Tilt 및 기타 런타임 구성 요소가 준비되었는지 확인합니다. 시스템을 수정하지는 않습니다. CLI 작업만 수행하는 경우 Docker나 Tilt 관련 실패 메시지는 무시해도 괜찮습니다.

`node cli/bin/flisk.js demo` 명령은 단순 미리보기가 아닌 완전한 단일 명령 데모입니다. `~/.flisk/flisk-demo`에 데모 프로젝트를 복제하고 `flisk`를 전역 설치한 뒤 스택을 실행합니다. Docker와 Tilt가 설정된 환경에서만 실행하세요.

## 8. 변경 사항 작성

파일을 수정한 후 3단계부터 5단계까지의 검사 과정을 다시 실행합니다. [DCO](../../.github/CONTRIBUTING.md) 서명과 함께 커밋합니다:

```bash
git add path/to/your/files
git commit -s -m "docs: describe the change"
```

`-s` 옵션은 풀 리퀘스트 검사에 필요한 `Signed-off-by:` 라인을 자동으로 추가합니다.

## 9. 풀 리퀘스트 열기

```bash
git push -u origin my-change
```

GitHub에서 작업 브랜치에서 `main` 브랜치를 대상으로 풀 리퀘스트를 열고, 본문에 `Fixes #<issue-number>`를 기재합니다. 템플릿 작성 요령 및 CI 실행 항목은 [변경 사항 확인 및 풀 리퀘스트 열기](03-open-a-pr.md)를 참고하세요.

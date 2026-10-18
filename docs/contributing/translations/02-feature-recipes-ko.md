# 2. 변경에 맞는 레시피 따르기

> 이 페이지는 [02-feature-recipes.md](../02-feature-recipes.md)의 번역입니다. 내용이 다르면 영어 버전이 우선합니다.

이 레시피들은 출발점입니다. 파일을 찾을 수 없다면 명령, 설정 키, 생성되는 파일 이름을 저장소에서 검색하고 issue에 질문하세요.

## CLI 명령 변경하기

1. `cli/src/commands/` 아래에서 명령을 찾으세요.
2. 테스트를 `cli/src/commands/__tests__/` 아래 또는 소스 파일 옆에서 찾으세요.
3. 이슈를 고치거나 옵션을 추가하는 데 필요한 가장 작은 변경을 하세요.
4. 명령이나 옵션이 사용자에게 보이면 `cli/README.md`를 업데이트하세요.
5. 저장소 루트에서 `bun run typecheck`, `bun run lint`, `bun run test`를 실행하세요.

프론트엔드 프레임워크라면 전용 [프론트엔드 provider 가이드](../../frontend-framework-providers.md)를 따르세요. React/Vue provider 경계, 엔진 템플릿, 호환성 검사, PR 체크리스트를 설명합니다.

## 데이터베이스 또는 인프라 도구 추가하기

먼저 무엇을 추가하는지 정하세요.

- **서비스가 사용하는 데이터베이스**는 서비스 manifest, 데이터베이스 URL 생성, 마이그레이션 설정, readiness 검사에 영향을 줄 수 있습니다.
- **공유 로컬 도구**(예: Redis 또는 NATS)는 선택 기능 설정, 생성되는 Compose 파일, Tilt 리소스 등록, 의존성, 헬스 체크에 영향을 줄 수 있습니다.

기존 코드를 지도처럼 사용하세요.

1. `engine/topologies/tilt/resources/infra-loader.star`에서 공유 인프라가 어떻게 로드되고 등록되는지 보세요.
2. 데이터베이스 수명 주기 예시로 `engine/topologies/tilt/resources/databases.star`를, Compose 생성은 `engine/topologies/platform/docker/compose/`를 보세요.
3. 관련 기능이나 manifest 설정을 찾아 검증되고 활성화되는 곳까지 따라가세요. `rg`로 설정 이름을 검색하세요.
4. 설정, 생성 파일, 시작 순서, 헬스/readiness, 환경 변수와 시크릿, 종료와 정리, 도구를 비활성화했을 때의 동작까지 전체 수명 주기를 추적하세요.
5. 변경한 동작에 대한 검사를 추가하세요. CLI와 Starlark 생성기 테스트는 `cli/src/commands/__tests__/`에 있고, Python 엔진 테스트는 `tests/tilt-engine/`에 있습니다.
6. `docs/FEATURES.md`나 `cli/README.md` 같은 사용자용 기능 또는 CLI 문서를 업데이트하세요.

새 도구에 위 파일이 모두 필요하다고 가정하지 마세요. 기능과 가장 가까운 현재 구현을 따르고, 공유 서비스 동작이 계속 작동하도록 하세요.

## Docker 없이 Starlark 변경 시도하기

Tilt만 설치되어 있으면 어떤 엔진 함수든 실행하고 출력을 볼 수 있습니다. 저장소 루트에 `try.Tiltfile`을 만드세요(git이 무시하는 파일입니다).

```python
load("engine/topologies/platform/docker/compose/compose.star", "generate_backend_compose_entry")

manifest = {"appType": "backend", "stack": "shop", "port": 4000, "appName": "orders-api"}
resource = {"name": "orders-api", "_resource_path": "services/shop/orders-api"}
manifest["_resource_path"] = resource["_resource_path"]

entry = generate_backend_compose_entry("services/shop", "orders-api", resource, manifest)
fail("OUTPUT\n" + entry)  # fail()은 Docker 없이 Tiltfile에서 문자열을 출력하는 방법입니다
```

```bash
tilt alpha tiltfile-result -f try.Tiltfile
```

생성된 Compose 항목은 `Error in fail: OUTPUT` 다음에 출력됩니다. `load()` 경로는 Tiltfile 기준 상대 경로이므로 파일은 저장소 루트에 두세요. manifest를 바꾸고 다시 실행해 결과를 비교하세요. `cli/src/commands/__tests__/`의 Starlark 테스트(예: `stack-routers.test.ts`)도 같은 방식으로 생성기 출력을 확인합니다. 테스트를 추가할 때는 그중 하나를 복사하세요.

## 엔진 또는 서비스 디스커버리 변경하기

1. Tilt 리소스 오케스트레이션은 `engine/topologies/tilt/resources/`에서 시작하세요.
2. Docker, 네트워킹, 영속 상태는 `engine/topologies/platform/`에서 시작하세요.
3. manifest 스캔과 의존성 그래프는 `discovery/`에서 시작하세요.
4. 영향을 받는 출력 파일이나 manifest 필드를 검색해 생성기와 테스트를 찾으세요. CLI 테스트에는 Starlark 생성기 검사가 포함됩니다.
5. 기존 manifest와 생성된 프로젝트가 계속 작동하는지 확인하세요. 동작이 바뀌면 스키마, 예제, CLI 문서를 업데이트하세요.
6. 변경이 계약이나 여러 모듈에 걸친다면 먼저 [OpenSpec 제안서](01-first-change-ko.md#변경-제안서를-작성할-때)를 작성하세요.

`engine/AGENTS.md`와 다른 `AGENTS.md` 파일은 에이전트를 위한 작업 메모입니다. 로컬 코드를 설명하는 데 도움이 될 수 있지만, 제품 문서로 쓰기 전에 경로와 조언을 현재 소스와 테스트에 대해 확인하세요.

## 문서 변경하기

1. 가장 가까운 기존 페이지를 찾아 업데이트하고, 새 복사본을 만들지 마세요.
2. 짧은 제목, 번호 매긴 단계, 복사해서 쓸 수 있는 명령을 사용하세요.
3. 편집한 파일에서 상대 링크가 맞는지 확인하세요.
4. 관련 있는 검사만 실행하세요. 문서만 바꾼 경우에는 바꾼 링크와 명령을 확인하면 되며, CLI 테스트 스위트를 실행할 필요는 없습니다.

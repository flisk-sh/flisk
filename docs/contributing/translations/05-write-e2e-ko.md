# 5. E2E 테스트 작성하기

> 이 페이지는 [05-write-e2e.md](../05-write-e2e.md)의 번역입니다. 내용이 다르면 영어 버전이 우선합니다.

종단간(E2E) 테스트는 실제 Docker, Tilt, Traefik 및 생성된 파일이 포함된 실제 스택을 대상으로 실제 `flisk`를 실행합니다. 단위 테스트로는 깨진 라우트, 준비 상태가 되지 않는 컨테이너, 또는 실제 오류로 인해 스택 트레이스로 변하는 JSON 엔벨로프를 잡아낼 수 없습니다. E2E 테스트는 이를 잡아낼 수 있습니다.

이 페이지에서는 E2E 테스트가 언제 필요한지, 어디에 배치하는지, 어떻게 작성하는지, 그리고 어떻게 동작을 증명하는지 설명합니다. 전체 과정에서 [에이전트 스위트](../../tests/e2e/resource-types/agent/run.sh)를 실전 예제로 활용합니다. AI 어시스턴트는 `flisk-e2e-author` 스킬(`.claude/skills/flisk-e2e-author/`)을 사용하여 동일한 단계를 따를 수 있습니다.

## E2E 테스트가 필요한가요?

다음과 같은 변경 사항이 있을 때 E2E 테스트를 추가하거나 확장하세요:

- 리소스 타입을 추가하거나, 타입의 스캐폴딩 내용 또는 실행 방식을 변경할 때;
- 실행 중인 스택과 통신하는 명령어 또는 MCP 도구를 추가할 때 (`flisk agent sessions`, `flisk restart`, `agent_sessions`);
- `flisk up`, `flisk down`, Traefik 라우팅, 또는 엔진이 생성하는 Compose 및 Tilt 파일을 변경할 때;
- 사용자가 플래그로 선택하는 백엔드 언어, 백엔드 또는 프론트엔드 프레임워크, 또는 기타 공급자(provider)를 추가할 때.

플래그 파싱, 모킹된 입력을 사용한 `--json` 서식 지정, 생성기의 텍스트 출력과 같이 스택을 시작하지 않는 변경 사항에는 E2E 테스트가 **필요하지 않습니다**. 이러한 테스트는 `cli/src/**/__tests__/` 아래의 단위 테스트에 속합니다. 스택을 부팅하지 않고 임시 프로젝트를 대상으로 CLI를 실행하는 테스트(`*-e2e.test.ts` 파일)는 `cli-integration` 그룹에 속하며 vitest에 유지됩니다.

## 그룹 선택하기

모든 라이브 스택 스위트는 `tests/e2e/<group>/<suite>/`에 위치하며, 증명하는 대상에 따라 정확히 하나의 그룹에 속합니다:

| 그룹 | 증명하는 대상 | 예시 |
|---|---|---|
| `resource-types` | 실제 스택에서 하나의 리소스 타입이 올바르게 동작함 | `resource-types/agent` |
| `journeys` | 다중 명령어 사용자 흐름 | quickstart, smoke runner, dev loop, cold start |
| `examples` | 실제 예제 앱이 부팅되고 라우트를 서비스함 | the default example, saas-starter |
| `platforms` | 호스트 환경 | `platforms/windows`, `platforms/windows-binary`, `platforms/wsl2`, `platforms/windows-hardware` |
| `scale` | 대규모 픽스처 또는 벤치마크 | the 100-service ERP fixture |

실행 중인 에이전트를 읽는 MCP 도구를 추가하시나요? 그렇다면 `agent` 스위트(또는 MCP 리소스의 경우 `mcp` 스위트)에 속합니다. 케이스 C1~C3의 형식을 따르세요.

현재까지는 `resource-types/agent`만 이전되었습니다. 다른 E2E 테스트는 여전히 `.github/workflows/*-e2e.yml`, `scripts/e2e/`, `scripts/verify-*.sh` 및 `tests/e2e/*.test.sh`에 위치합니다. 이들은 [`openspec/changes/organize-e2e-suites`](../../openspec/changes/organize-e2e-suites/tasks.md)에 설명된 대로 풀 리퀘스트당 하나의 스위트씩 이전됩니다. 변경 사항이 이들 중 하나와 관련된 경우, 현재 위치에서 확장하거나 먼저 이전하세요.

---

가이드의 나머지 부분은 [05-write-e2e.md](../05-write-e2e.md)에서 영어로 제공됩니다.

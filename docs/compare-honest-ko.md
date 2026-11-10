# Flisk와 기존 도구 비교

> 이 문서는 [compare-honest.md](compare-honest.md)의 한국어 번역입니다.

Flisk CLI는 서비스마다 존재하는 `service.json`을 로컬 Docker 스택으로 변환하며, 로컬 개발 도구인 Tilt가 서비스를 감시하고 코드 수정 시 컨테이너를 실시간으로 업데이트(live-update)합니다. Flisk는 배포 도구가 아니며 Compose 대체재도 아닙니다. 프로덕션 환경은 여전히 Helm을 사용합니다. Docker Compose, 기본 Tilt, Skaffold, DevSpace, kind/minikube 등을 포함한 심층 기술 비교는 [Flisk와 대안 개발 도구 비교](comparison.md)를 참고하세요.

## Compose

Compose는 이미 작성된 2~3개의 서비스에 더 적합합니다. Flisk는 스캐폴딩(scaffolding), 선택적 `flisk up <stack>` 실행, 더 큰 서비스 세트를 위한 자동 생성된 Tiltfile이 필요할 때 유용합니다.

## Tilt

Flisk는 Tilt의 서비스 감시자(service watcher) 및 라이브 업데이트 루프를 구성하는 Tiltfile을 작성합니다. 이미 Tiltfile을 직접 관리하고 있고 기존 워크플로에 만족한다면 Tilt를 계속 사용하세요.

## Skaffold, Garden, DevSpace

해당 도구들은 클러스터를 대상으로 합니다. Flisk는 그렇지 않으며, 로컬 Docker + Tilt 개발 루프를 실행합니다. 프로덕션 배포는 여전히 Helm이나 Kubernetes 워크플로에 남아 있습니다.

## AI 에이전트 프레임워크 및 워크플로 엔진 (libfx, LangGraph, Mastra, Vercel Workflows, Temporal)

개발자들이 최신 에이전트 런타임 및 내구성(durability) 엔진과 Flisk의 차이점을 물을 때의 답은 다음과 같습니다:

**Flisk는 내구성 있는 실행을 직접 구현하지 않고, 이를 호스팅합니다.**

Flisk는 에이전트 *시스템*을 위한 로컬 런타임 및 토폴로지 오케스트레이터입니다. `libfx`, LangGraph, Mastra, Vercel Workflows, Temporal 같은 도구는 단계가 어떻게 실행되고, 재시도되며, 체크포인트를 생성하는지 정의합니다. Flisk는 에이전트 프로세스, 체크포인트 볼륨, MCP 도구 서버, 데이터베이스, 큐, 게이트웨이가 로컬에서 어떻게 함께 실행되는지를 정의합니다.

### 역할 분담

| 기능 | 에이전트 프레임워크 / 워크플로 엔진 (`libfx`, LangGraph, Mastra, Vercel Workflows, Temporal) | 로컬 오케스트레이터 (Flisk CLI) |
| --- | --- | --- |
| **에이전트 로직 및 모델 호출** | 담당 (프롬프트, 도구 호출, 턴 루프) | 중립적 (벤더 독립적인 러너 스캐폴딩) |
| **내구성 및 체크포인트** | 실행 상태 및 단계 재생(replay) 담당 | 지속성 있는 네임드 볼륨 / 데이터베이스 인스턴스 제공 |
| **세션 라우팅** | 세션 ID 정의 | Traefik이 스티키 세션 헤더(`x-session-id`) 라우팅 |
| **도구 실행 (MCP)** | MCP 서버 호출 | Traefik 라우팅과 함께 `--type mcp` 리소스 스캐폴딩 및 호스팅 |
| **로컬 인프라** | 없음 (환경 변수로 URL/인증 정보 기대) | Postgres, NATS, Traefik 프로비저닝 및 `@ref()` 환경 변수 연결 |
| **핫 리로드 및 개발 루프** | 러너에 의존 | Tilt가 지원되는 코드 변경 사항을 전체 재빌드 없이 컨테이너에 동기화 (기타 변경은 프로세스 리로더 또는 이미지 재빌드로 처리) |
| **라이프사이클 및 종료** | 드레인 핸들러(drain handler) 구현 | SIGTERM 신호를 전송하고 Docker 헬스체크(`/health`)를 통해 컨테이너 시작 제어 |

`libfx`나 LangGraph를 사용하더라도 로컬 데이터베이스, 재시작 시 유지되는 지속적인 체크포인트 볼륨, 다른 서비스가 에이전트에 접근할 수 있도록 하는 게이트웨이가 여전히 필요합니다. Flisk는 바로 이러한 요소들이 로컬에서 구동되는 공간입니다.

## 알려진 제한 사항

- 커뮤니티 규모가 아직 작습니다.
- 내장 생성기(generator)는 TypeScript 우선입니다. Go, Java, Python 서비스는 사용자가 직접 가져와야 합니다(bring your own).
- 100개 서비스 수치는 생성된 `/health` 스텁을 사용한 픽스처 벤치마크이며, 실제 애플리케이션 워크로드가 아닙니다. [주장 레지스트리](claims.md)와 [벤치마크 노트](benchmarks/scale-bench.md)를 참고하세요.
- 네이티브 Windows에서는 로컬 프로세스 프로젝트와 `flisk demo`만 실행됩니다. Docker 스택은 WSL2 기반 Ubuntu가 필요합니다.
- 로컬 개발 전용입니다. Flisk는 배포하지 않습니다. 프로덕션은 Helm, Argo CD, Kustomize를 사용하며, CI/CD를 대체하지 않습니다.
- Docker와 Tilt가 필요합니다. 이미 팀에 성숙한 Compose, DevContainer 또는 로컬 Kubernetes 환경이 구축되어 있다면 도입 효과가 작을 수 있습니다.
- 단일 서비스의 여러 인스턴스를 로컬에서 실행하는 것은 아직 지원되지 않습니다 (포트, 식별자, 서비스 디스커버리가 미해결 설계 과제로 남아 있음).
- 16GB 노트북 환경에서 소규모 스택의 CPU 및 RAM 사용량은 아직 벤치마크되지 않았습니다. 측정 대상 항목은 [벤치마크 노트](benchmarks/scale-bench.md)를 참고하세요.
- 프로젝트가 초기 단계이므로 문서, 예제, 커뮤니티 지식이 제한적입니다.
- 종료 시 SIGTERM을 전송하지만, 진행 중인 작업(큐, 백그라운드 작업)을 정상 종료(drain)하는 것은 각 서비스의 책임입니다. 정상 상태(healthy) 컨테이너라도 SIGTERM을 무시하면 작업이 유실될 수 있습니다.
- 환경 변수는 `FLISK_` 접두사로 이전되는 중입니다. 현재는 두 방식 모두 동작하며(`FLISK_X` 우선), `FLISK_X`는 지원 중단 경고를 출력합니다. CI에서 이 경고를 숨기려면 `FLISK_QUIET_DEPRECATIONS=1`을 설정하세요.

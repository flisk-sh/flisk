# TDK CLI — 노트북에서 서비스 시작하기

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | 한국어

TDK CLI는 노트북에서 서비스를 시작합니다. 배포 도구도, Compose 파일도 아닙니다. 각 서비스를 `service.json`에 정의한 뒤 `tdk up`을 실행하면 됩니다. 머신에 Kubernetes는 필요하지 않습니다.

안정성: 1.x 로컬 개발용. 생성된 파일은 계약으로 취급되며 `tdk config verify`로 검증할 수 있습니다. 코어 CLI는 MIT 라이선스이며 키가 필요 없습니다. Premium은 선택 사항입니다.

컨테이너는 Docker가 실행합니다. Tilt는 서비스를 감시하고 코딩하는 동안 컨테이너를 라이브 업데이트합니다. TDK CLI는 Tilt가 사용하는 설정을 작성합니다. 프로덕션 배포는 계속 Helm, Argo CD, Kustomize가 담당합니다.

[웹사이트](https://tdk-landscape.github.io/tdk-website/) · [빠른 시작](https://tdk-landscape.github.io/tdk-website/docs/quickstart/) · [예제](https://tdk-landscape.github.io/tdk-website/docs/examples/) · [Awesome TDK](https://github.com/tdk-landscape/awesome-tdk-framework) · [데모](https://tdk-landscape.github.io/tdk-demo-animation/) · [버그 신고](https://github.com/tdk-landscape/tdk-cli-core/issues)

TDK로 로컬 서비스 스택을 실행하고 계시다면, [이 저장소](https://github.com/tdk-landscape/tdk-cli-core)에 ⭐를 눌러 다른 개발자들이 찾을 수 있게 도와주세요.

## 왜 TDK CLI인가요?

- **서비스마다 `service.json` 하나.** TDK가 이 파일로 Dockerfile, Traefik 라우팅, Tiltfile을 생성합니다. `docker-compose.yml`이나 `nginx.conf`를 직접 작성할 필요가 없습니다.
- **Kubernetes 없이 여는 로컬 스택.** 서비스는 내 컴퓨터에서 Docker와 Tilt로 실행됩니다. kind나 minikube 같은 로컬 클러스터는 필요 없습니다.
- **코딩하는 동안 핫 리로드.** 파일이 바뀌면 Tilt가 컨테이너를 라이브로 업데이트합니다.
- **확인할 수 있는 생성 파일.** `tdk`는 생성된 파일을 기록하고 드리프트를 보고하므로, 로컬 설정을 `service.json`과 일치한 상태로 유지할 수 있습니다. 자세한 내용은 [생성 파일 및 드리프트 검사](generated-files.md)를 참고하세요.

## TDK를 사용하는 팀

아직 등록된 팀이 없습니다. 첫 번째가 되어 주세요. [TDK를 사용한다고 알려 주세요](https://github.com/tdk-landscape/tdk-cli-core/issues/new?template=we-use-tdk.yml) 또는 [ADOPTERS.md](../ADOPTERS.md)에 행을 추가하세요.

## 빠른 시작

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
curl http://api.shop.localhost:8080/api/orders/health
```

![TDK가 백엔드와 프런트엔드를 스캐폴딩하고 스택을 나열하는 모습](assets/demo.svg)

*백엔드와 프런트엔드를 스캐폴딩한 뒤 스택을 나열합니다.*

![TDK CLI 활용 사례 Top 9: 서비스 스캐폴딩, 스택 시작, 핫 리로드, 포트 관리, 자동 검색, 부팅 순서, 프록시 라우팅, 인프라 포함, 설정 검증](assets/tdk-cli-top-9-uses.jpg)

Helm, Compose 또는 기존 Tilt 설정으로 이미 로컬 환경이 잘 동작한다면 계속 사용하세요. TDK CLI는 여러 서비스를 관리하면서 명확한 로컬 서비스 계약과 스택을 시작하는 명령 하나를 원하는 엔지니어를 위한 도구입니다.

[Helm과 함께 사용하는 방법](https://tdk-landscape.github.io/tdk-website/docs/with-helm/), [서비스 스키마](../engine/schemas/service-schema.json), [프로젝트 설정 스키마](../engine/schemas/project-schema.json)도 참고하세요.

[![npm version](https://img.shields.io/npm/v/@tdk-landscape/tdk-cli-core.svg?style=flat&color=blue)](https://www.npmjs.com/package/@tdk-landscape/tdk-cli-core)
[![CI](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/ci.yml/badge.svg)](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/ci.yml)
[![Quickstart E2E](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/quickstart-e2e.yml/badge.svg)](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/quickstart-e2e.yml)
[![ERP fixture scale E2E](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/erp-scale-e2e.yml/badge.svg)](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/erp-scale-e2e.yml)
[![Example apps E2E](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/examples-e2e.yml/badge.svg?branch=main)](https://github.com/tdk-landscape/tdk-cli-core/actions/workflows/examples-e2e.yml)
[![Known Vulnerabilities](https://snyk.io/test/github/tdk-landscape/tdk-cli-core/badge.svg)](https://snyk.io/test/github/tdk-landscape/tdk-cli-core)
[![Socket Badge](https://badge.socket.dev/npm/package/@tdk-landscape/tdk-cli-core/latest)](https://socket.dev/npm/package/@tdk-landscape/tdk-cli-core/overview)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)

## 설치

npm으로 CLI를 설치하거나(Node.js 22.12+ 필요) 사전 빌드된 바이너리를 사용하세요(Node.js도 Bun도 필요 없음):

```bash
npm install -g @tdk-landscape/tdk-cli-core
# or install the prebuilt binary
curl -fsSL https://tdk-landscape.github.io/install.sh | sh
```

`tdk up shop --dry-run`은 컨테이너를 시작하기 전에 선택된 로컬 서비스와 URL을 미리 보여줍니다. 기본 스타터는 Bun/TypeScript이며, TDK의 핵심 역할은 Docker + Tilt로 로컬 컨테이너를 실행하는 것이지 Node.js 애플리케이션 프레임워크를 제공하는 것이 아닙니다. [단일 백엔드 예제](../examples/one-backend/README.md)를 참고하세요.

## TDK를 사용하지 말아야 할 때

- 기존 Compose 또는 Tilt 워크플로로 이미 로컬 환경이 잘 동작한다.
- Helm이 개발 워크플로 전체이며 로컬 서비스를 Docker에서 실행하고 싶지 않다.
- `service.json` 매니페스트와 생성되는 로컬 설정을 원하지 않는다.

## 문서

- [문서 색인](README.md)
- [Helm과 함께 사용하기](with-helm.md)
- [설정 및 에디터 스키마](configuration.md)
- [실행 가능한 단일 백엔드 예제](../examples/one-backend/README.md)
- [실행 가능한 Python 백엔드 예제](../examples/one-backend-python/README.md)
- [전체 멀티 서비스 예제](../examples/tdk-example/README.md)
- [기능 및 라이선스 제한](FEATURES.md)
- [솔직한 비교와 알려진 한계](compare-honest.md)
- [공개 주장 레지스트리](claims.md)
- [Show HN 초안](drafts/show-hn.md)
- [아키텍처 및 저장소 맵](project-overview.md)
- [스케일 픽스처 측정 결과와 주의 사항](benchmarks/scale-bench.md)

## 역사

TDK는 이 저장소와 npm 패키지 날짜가 시사하는 것보다 오래되었습니다. 개발은 2026년 4월 21일 [tdk-landscape/tdk](https://github.com/tdk-landscape/tdk)에서 시작되었으며, 이 저장소는 현재 아카이브되어 읽기 전용 기록으로 남아 있습니다. 첫 커밋은 [`1714637`](https://github.com/tdk-landscape/tdk/commit/1714637637196ed54cbfa18534230a782c05ab36)("Initial commit: TDK specs, generators, CLI, and standards")입니다. 이 저장소 `tdk-cli-core`는 2026년 9월 19일에 만들어졌고 개발은 여기서 계속됩니다. npm의 `@tdk-landscape/tdk-cli-core` 패키지는 2026년 9월 21일에 처음 게시되었습니다. 따라서 코드 계보는 GitHub와 npm에서 보이는 저장소 및 패키지 날짜보다 약 5개월 앞서 있습니다.

## 요구 사항 및 지원

로컬 런타임에는 Docker(Desktop, OrbStack 또는 Colima, Engine 25+, Compose 2.20.2+)와 [Tilt](https://docs.tilt.dev/install.html)를 설치하세요. 기본으로 생성되는 서비스는 Bun 1.2+를 사용합니다. TDK는 HTTP, HTTPS, Postgres용 호스트 포트를 범위가 제한된 대체 범위에서 선택합니다. 재정의하려면 `TDK_HTTP_PORT`, `TDK_HTTPS_PORT`, `TDK_POSTGRES_PORT`를 설정하세요. TDK는 macOS, Linux, 그리고 WSL2 Ubuntu를 통한 Windows를 지원하며, 네이티브 Windows에서는 CLI 확인만 가능합니다. `tdk doctor`를 실행해 로컬 준비 상태를 확인하세요. [WSL2 설정](wsl2.md)을 참고하세요.

네이티브 Windows에서 `tdk --version`, `tdk doctor`, `tdk up --dry-run`은 확인 전용 명령입니다. `tdk up`은 종료 코드 2로 종료되며 "Landscape startup needs Ubuntu on WSL2. Native Windows is inspect-only."라고 표시합니다.

## 라이선스 매트릭스

| 기능 | 무료 | Premium |
| --- | --- | --- |
| `tdk up`, 스캐폴드, Traefik, Postgres, Tilt 라이브 업데이트, golden layers | 예 | 예 |
| Verdaccio, DDD 스캐폴드, Sablier 유휴 중지 | 아니요 | 키 필요 |
| Playwright, C4, AGENTS.md | 저장소 안에서 생성하면 무료 | 키로 구현을 내려받은 경우에만 |

코어는 계속 무료입니다. Premium은 위의 추가 기능을 위한 별도 키이며, `tdk up`을 실행하는 데 키는 필요 없습니다.

**생태계 맵:** 예제, 글, 관련 도구, 노트는 [awesome-tdk-framework](https://github.com/tdk-landscape/awesome-tdk-framework)에 있습니다. 이 CLI를 실제로 사용한다면 이 저장소(`tdk-cli-core`)에 스타를 눌러 주세요. 나머지는 awesome 목록에서 둘러보세요.

**공유:** [X](https://twitter.com/intent/tweet?text=TDK%20CLI%EB%A1%9C%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%EB%A5%BC%20%EB%9D%84%EC%9B%A0%EB%8A%94%EB%8D%B0%20%EC%A0%95%EB%A7%90%20%EC%A2%8B%EC%95%84%EC%9A%94%21%20%EB%AC%B4%EB%A3%8C%EC%9D%B4%EA%B3%A0%20%EC%98%A4%ED%94%88%20%EC%86%8C%EC%8A%A4%EC%9E%85%EB%8B%88%EB%8B%A4.%20%ED%95%9C%EB%B2%88%20%EB%B3%B4%EC%84%B8%EC%9A%94%3A&url=https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core) · [Bluesky](https://bsky.app/intent/compose?text=TDK%20CLI%EB%A1%9C%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%EB%A5%BC%20%EB%9D%84%EC%9B%A0%EB%8A%94%EB%8D%B0%20%EC%A0%95%EB%A7%90%20%EC%A2%8B%EC%95%84%EC%9A%94%21%20%EB%AC%B4%EB%A3%8C%EC%9D%B4%EA%B3%A0%20%EC%98%A4%ED%94%88%20%EC%86%8C%EC%8A%A4%EC%9E%85%EB%8B%88%EB%8B%A4.%20%ED%95%9C%EB%B2%88%20%EB%B3%B4%EC%84%B8%EC%9A%94%3A%20https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core) · [Threads](https://www.threads.net/intent/post?text=TDK%20CLI%EB%A1%9C%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%EB%A5%BC%20%EB%9D%84%EC%9B%A0%EB%8A%94%EB%8D%B0%20%EC%A0%95%EB%A7%90%20%EC%A2%8B%EC%95%84%EC%9A%94%21%20%EB%AC%B4%EB%A3%8C%EC%9D%B4%EA%B3%A0%20%EC%98%A4%ED%94%88%20%EC%86%8C%EC%8A%A4%EC%9E%85%EB%8B%88%EB%8B%A4.%20%ED%95%9C%EB%B2%88%20%EB%B3%B4%EC%84%B8%EC%9A%94%3A%20https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core) · [Mastodon](https://mastodon.social/share?text=TDK%20CLI%EB%A1%9C%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%EB%A5%BC%20%EB%9D%84%EC%9B%A0%EB%8A%94%EB%8D%B0%20%EC%A0%95%EB%A7%90%20%EC%A2%8B%EC%95%84%EC%9A%94%21%20%EB%AC%B4%EB%A3%8C%EC%9D%B4%EA%B3%A0%20%EC%98%A4%ED%94%88%20%EC%86%8C%EC%8A%A4%EC%9E%85%EB%8B%88%EB%8B%A4.%20%ED%95%9C%EB%B2%88%20%EB%B3%B4%EC%84%B8%EC%9A%94%3A%20https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core) · [Reddit](https://www.reddit.com/submit?title=TDK%20CLI%3A%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%20%EC%8B%9C%EC%9E%91&url=https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core) · [Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core&t=TDK%20CLI%3A%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%20%EC%8B%9C%EC%9E%91) · [Facebook](https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core) · [LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core&mini=true&title=TDK%20CLI%3A%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%20%EC%8B%9C%EC%9E%91&summary=TDK%20CLI%EB%A1%9C%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%EB%A5%BC%20%EB%9D%84%EC%9B%A0%EB%8A%94%EB%8D%B0%20%EC%A0%95%EB%A7%90%20%EC%A2%8B%EC%95%84%EC%9A%94%21%20%EB%AC%B4%EB%A3%8C%EC%9D%B4%EA%B3%A0%20%EC%98%A4%ED%94%88%20%EC%86%8C%EC%8A%A4%EC%9E%85%EB%8B%88%EB%8B%A4.) · [Telegram](https://t.me/share/url?url=https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core&text=TDK%20CLI%EB%A1%9C%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%EB%A5%BC%20%EB%9D%84%EC%9B%A0%EB%8A%94%EB%8D%B0%20%EC%A0%95%EB%A7%90%20%EC%A2%8B%EC%95%84%EC%9A%94%21%20%EB%AC%B4%EB%A3%8C%EC%9D%B4%EA%B3%A0%20%EC%98%A4%ED%94%88%20%EC%86%8C%EC%8A%A4%EC%9E%85%EB%8B%88%EB%8B%A4.%20%ED%95%9C%EB%B2%88%20%EB%B3%B4%EC%84%B8%EC%9A%94%3A) · [WhatsApp](https://wa.me/?text=TDK%20CLI%EB%A1%9C%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%EB%A5%BC%20%EB%9D%84%EC%9B%A0%EB%8A%94%EB%8D%B0%20%EC%A0%95%EB%A7%90%20%EC%A2%8B%EC%95%84%EC%9A%94%21%20%EB%AC%B4%EB%A3%8C%EC%9D%B4%EA%B3%A0%20%EC%98%A4%ED%94%88%20%EC%86%8C%EC%8A%A4%EC%9E%85%EB%8B%88%EB%8B%A4.%20%ED%95%9C%EB%B2%88%20%EB%B3%B4%EC%84%B8%EC%9A%94%3A%20https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core) · [Email](mailto:?subject=TDK%20CLI%3A%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%20%EC%8B%9C%EC%9E%91&body=TDK%20CLI%EB%A1%9C%20%EB%AA%85%EB%A0%B9%EC%96%B4%20%ED%95%98%EB%82%98%EB%A1%9C%20%EB%A1%9C%EC%BB%AC%20%EC%84%9C%EB%B9%84%EC%8A%A4%EB%A5%BC%20%EB%9D%84%EC%9B%A0%EB%8A%94%EB%8D%B0%20%EC%A0%95%EB%A7%90%20%EC%A2%8B%EC%95%84%EC%9A%94%21%20%EB%AC%B4%EB%A3%8C%EC%9D%B4%EA%B3%A0%20%EC%98%A4%ED%94%88%20%EC%86%8C%EC%8A%A4%EC%9E%85%EB%8B%88%EB%8B%A4.%20%ED%95%9C%EB%B2%88%20%EB%B3%B4%EC%84%B8%EC%9A%94%3A%20https%3A%2F%2Fgithub.com%2Ftdk-landscape%2Ftdk-cli-core)

## 기여 및 라이선스

기여를 환영합니다. [기여 가이드(한국어)](contributing/translations/CONTRIBUTING-ko.md)와 [기여자 가이드](contributing/README.md)부터 시작하세요. pull request를 리뷰하려면 [pull request 리뷰하기](contributing/04-review-a-pr.md)(영어)를 참고하세요. 보안 문제는 [SECURITY.md](../SECURITY.md)에 따라 신고해 주세요.

TDK는 MIT 라이선스입니다. [LICENSE](../LICENSE)를 참고하세요.

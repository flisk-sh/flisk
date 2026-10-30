# Flisk: 내 컴퓨터에서 명령 하나로 앱 전체를 실행

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | 한국어 | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md) | [Română](README-ro.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

Flisk는 로컬 개발용 명령줄 도구입니다. 앱의 모든 부분(API, 웹사이트, 워커, AI 에이전트, 데이터베이스)을 하나의 로컬 주소 뒤에서 사용자의 컴퓨터로 실행하고, 저장하면 해당 부분을 다시 불러옵니다. 각 부분은 작은 `service.json`에 정의하며, Flisk가 이를 바탕으로 Dockerfile, Compose 파일, Tiltfile을 만들고 동기화 상태를 유지합니다. 배포는 하지 않습니다. 프로덕션은 직접 쓰는 도구에 맡깁니다.

빠른 시작:

```bash
# npm install -g @flisk-sh/flisk
mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk resource shop-web --type frontend --stack shop --yes
flisk up shop
```

자세한 내용은 [영어 README](../README.md)를 참고하세요.

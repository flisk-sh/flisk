# TDK CLI — 전체 기술 스택을 생성하고 실행

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | 한국어 | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

빈 폴더에서 명령 하나로 실행 중인 기술 스택까지. 각 서비스를 `service.json`에 정의한 뒤 `tdk up`을 실행하세요. 머신에 Kubernetes는 필요 없습니다.

빠른 시작:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

자세한 내용은 [영어 README](../README.md)를 참고하세요.

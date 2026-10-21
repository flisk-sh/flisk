# Flisk CLI — gere e execute toda a sua stack técnica

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/tdk-cli-core/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/tdk-cli-core/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | Português (Brasil) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="tdk-landscape%2Ftdk-cli-core | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="tdk-landscape%2Ftdk-cli-core | Trendshift" width="250" height="55"/></a>

De uma pasta vazia a uma stack rodando com um comando. Defina cada serviço em `service.json` e execute `flisk up`. Não é preciso Kubernetes na máquina.

Início rápido:

```bash
npm install -g flisk
mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk up shop
```

O guia completo está no [README em inglês](../README.md).

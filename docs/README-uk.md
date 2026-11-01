# Flisk: увесь ваш застосунок запущений на вашому комп'ютері однією командою

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | Українська | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md) | [Română](README-ro.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

Flisk — це інструмент командного рядка для локальної розробки. Він запускає кожну частину вашого застосунку (API, вебсайт, воркери, ШІ-агенти, базу даних) на вашому комп'ютері за однією локальною адресою й перезавантажує частину, щойно ви її збережете. Кожну частину ви описуєте в невеликому `service.json`; Flisk створює з нього Dockerfile, файл Compose і Tiltfile та підтримує їх синхронними. Він не розгортає застосунок: продакшн лишається за вашими власними інструментами.

Швидкий старт:

```bash
npx @flisk-sh/flisk demo
```

Повна інструкція в [англійському README](../README.md).

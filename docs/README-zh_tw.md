# TDK CLI — 一次指令產生並執行整套技術堆疊

[English](../README.md) | [简体中文](README-zh_cn.md) | 繁體中文 | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

從空資料夾到執行中的技術堆疊，只需一條指令。在 `service.json` 中定義每個服務，然後執行 `tdk up`。機器上不需要 Kubernetes。

快速開始:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

完整說明請參閱[英文 README](../README.md)。

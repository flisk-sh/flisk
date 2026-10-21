# Flisk CLI — 技術スタック全体を生成して起動

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/tdk-cli-core/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/tdk-cli-core/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | 日本語 | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="tdk-landscape%2Ftdk-cli-core | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="tdk-landscape%2Ftdk-cli-core | Trendshift" width="250" height="55"/></a>

空のフォルダから、1 つのコマンドで動くスタックまで。各サービスを `service.json` で定義し、`flisk up` を実行するだけです。マシンに Kubernetes は不要です。

クイックスタート:

```bash
npm install -g flisk
mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk up shop
```

詳しい説明は [英語版 README](../README.md) をご覧ください。

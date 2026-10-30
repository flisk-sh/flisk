# Flisk：アプリ全体を、コマンド 1 つで自分のコンピューターで動かす

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | 日本語 | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md) | [Română](README-ro.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

Flisk はローカル開発用のコマンドラインツールです。アプリの各パーツ（API、ウェブサイト、ワーカー、AI エージェント、データベース）を、1 つのローカルアドレスの背後であなたのコンピューター上で動かし、保存するとそのパーツを再読み込みします。各パーツは小さな `service.json` に記述し、Flisk がそこから Dockerfile、Compose ファイル、Tiltfile を書き出して同期を保ちます。デプロイは行いません。本番環境はあなた自身のツールに任せます。

クイックスタート:

```bash
# npm install -g @flisk-sh/flisk
mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk resource shop-web --type frontend --stack shop --yes
flisk up shop
```

詳しい説明は [英語版 README](../README.md) をご覧ください。

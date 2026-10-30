# Flisk: toàn bộ ứng dụng của bạn chạy trên máy tính của bạn chỉ với một lệnh

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | Tiếng Việt | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md) | [Română](README-ro.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

Flisk là công cụ dòng lệnh cho phát triển cục bộ. Nó chạy mọi phần của ứng dụng (API, website, worker, AI agent, cơ sở dữ liệu) trên máy tính của bạn sau một địa chỉ cục bộ duy nhất, và tải lại một phần khi bạn lưu nó. Bạn mô tả từng phần trong một `service.json` nhỏ; Flisk viết Dockerfile, file Compose và Tiltfile từ đó, rồi giữ chúng đồng bộ. Flisk không triển khai: môi trường production vẫn do các công cụ của riêng bạn đảm nhận.

Bắt đầu nhanh:

```bash
npm install -g @flisk-sh/flisk
# mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk resource shop-web --type frontend --stack shop --yes
flisk up shop
```

Hướng dẫn đầy đủ có trong [README tiếng Anh](../README.md).

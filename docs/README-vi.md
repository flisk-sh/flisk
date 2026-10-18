# TDK CLI — tạo và chạy toàn bộ tech stack của bạn

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | Tiếng Việt | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

Từ một thư mục trống đến một stack đang chạy chỉ với một lệnh. Khai báo từng service trong `service.json`, rồi chạy `tdk up`. Máy không cần Kubernetes.

Bắt đầu nhanh:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Hướng dẫn đầy đủ có trong [README tiếng Anh](../README.md).

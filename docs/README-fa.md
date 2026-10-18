# TDK CLI — ساخت و اجرای کل پشته فنی شما

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | فارسی | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

از یک پوشه خالی تا یک پشته فنی در حال اجرا با یک دستور. هر سرویس را در `service.json` تعریف کنید و `tdk up` را اجرا کنید. روی دستگاه به Kubernetes نیازی نیست.

شروع سریع:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

راهنمای کامل در [README انگلیسی](../README.md) است.

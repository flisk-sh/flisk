# TDK CLI — شغّل مكدسك التقني كاملاً على جهازك

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | العربية | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

انتقل من مجلد فارغ إلى مكدس تقني يعمل بأمر واحد. عرّف كل خدمة في `service.json` ثم شغّل `tdk up`. لا يحتاج الجهاز إلى Kubernetes.

البداية السريعة:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

للدليل الكامل، راجع [README الإنجليزي](../README.md).

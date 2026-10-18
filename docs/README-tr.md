# TDK CLI — tüm teknoloji yığınınızı oluşturun ve çalıştırın

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | Türkçe | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

Boş bir klasörden tek komutla çalışan bir yığına. Her servisi `service.json` içinde tanımlayın, ardından `tdk up` çalıştırın. Makinede Kubernetes gerekmez.

Hızlı başlangıç:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Tam kılavuz için [İngilizce README](../README.md) dosyasına bakın.

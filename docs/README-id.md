# TDK CLI — buat dan jalankan seluruh tech stack Anda

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | Bahasa Indonesia | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

Dari folder kosong ke tech stack yang berjalan dengan satu perintah. Definisikan setiap layanan di `service.json`, lalu jalankan `tdk up`. Mesin tidak perlu Kubernetes.

Mulai cepat:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Panduan lengkap ada di [README bahasa Inggris](../README.md).

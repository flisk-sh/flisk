# TDK CLI — genera ed esegui l'intero stack tecnico

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | Italiano | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

Da una cartella vuota a uno stack in esecuzione con un solo comando. Definisci ogni servizio in `service.json` ed esegui `tdk up`. Sulla macchina non serve Kubernetes.

Avvio rapido:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

La guida completa è nel [README in inglese](../README.md).

# TDK CLI — den gesamten Tech-Stack erzeugen und starten

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | Deutsch | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

Vom leeren Ordner zu einem laufenden Tech-Stack mit einem Befehl. Definieren Sie jeden Dienst in `service.json` und führen Sie `tdk up` aus. Auf dem Rechner ist kein Kubernetes nötig.

Schnellstart:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Die vollständige Anleitung finden Sie in der [englischen README](../README.md).

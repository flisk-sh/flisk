# TDK CLI — δημιουργία και εκτέλεση ολόκληρης της στοίβας σας

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | Ελληνικά | [മലയാളം](README-ml.md)

Από έναν άδειο φάκελο σε μια εκτελούμενη στοίβα με μία εντολή. Ορίστε κάθε υπηρεσία στο `service.json` και εκτελέστε `tdk up`. Δεν χρειάζεται Kubernetes στο μηχάνημα.

Γρήγορη εκκίνηση:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Ο πλήρης οδηγός βρίσκεται στο [αγγλικό README](../README.md).

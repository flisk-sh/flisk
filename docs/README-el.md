# Flisk: ολόκληρη η εφαρμογή σας εκτελείται στον υπολογιστή σας με μία εντολή

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | Ελληνικά | [മലയാളം](README-ml.md) | [Română](README-ro.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

Το Flisk είναι ένα εργαλείο γραμμής εντολών για τοπική ανάπτυξη. Εκτελεί κάθε μέρος της εφαρμογής σας (API, ιστότοπο, workers, πράκτορες AI, βάση δεδομένων) στον υπολογιστή σας πίσω από μία τοπική διεύθυνση και επαναφορτώνει ένα μέρος όταν το αποθηκεύετε. Περιγράφετε κάθε μέρος σε ένα μικρό `service.json`· το Flisk γράφει από αυτό τα Dockerfile, το αρχείο Compose και το Tiltfile και τα διατηρεί συγχρονισμένα. Δεν κάνει deploy: η παραγωγή μένει στα δικά σας εργαλεία.

Γρήγορη εκκίνηση:

```bash
npm install -g @flisk-sh/flisk
# mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk resource shop-web --type frontend --stack shop --yes
flisk up shop
```

Ο πλήρης οδηγός βρίσκεται στο [αγγλικό README](../README.md).

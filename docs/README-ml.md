# Flisk CLI — നിങ്ങളുടെ മുഴുവൻ ടെക് സ്റ്റാക്കും സൃഷ്ടിച്ച് പ്രവർത്തിപ്പിക്കുക

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | മലയാളം

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

ഒരു ശൂന്യ ഫോൾഡറിൽ നിന്ന് ഒറ്റ കമാൻഡിലൂടെ പ്രവർത്തിക്കുന്ന സ്റ്റാക്ക് വരെ. ഓരോ സേവനവും `service.json`-ൽ നിർവചിച്ച് `flisk up` പ്രവർത്തിപ്പിക്കുക. Kubernetes ആവശ്യമില്ല.

ദ്രുത ആരംഭം:

```bash
npm install -g @flisk-sh/flisk
mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk up shop
```

പൂർണ്ണ ഗൈഡ് [ഇംഗ്ലീഷ് README](../README.md)-ൽ ഉണ്ട്.

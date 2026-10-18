# TDK CLI — നിങ്ങളുടെ മുഴുവൻ ടെക് സ്റ്റാക്കും സൃഷ്ടിച്ച് പ്രവർത്തിപ്പിക്കുക

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | മലയാളം

ഒരു ശൂന്യ ഫോൾഡറിൽ നിന്ന് ഒറ്റ കമാൻഡിലൂടെ പ്രവർത്തിക്കുന്ന സ്റ്റാക്ക് വരെ. ഓരോ സേവനവും `service.json`-ൽ നിർവചിച്ച് `tdk up` പ്രവർത്തിപ്പിക്കുക. Kubernetes ആവശ്യമില്ല.

ദ്രുത ആരംഭം:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

പൂർണ്ണ ഗൈഡ് [ഇംഗ്ലീഷ് README](../README.md)-ൽ ഉണ്ട്.

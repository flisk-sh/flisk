# Flisk: നിങ്ങളുടെ മുഴുവൻ ആപ്പും ഒരൊറ്റ കമാൻഡിൽ നിങ്ങളുടെ കമ്പ്യൂട്ടറിൽ പ്രവർത്തിക്കുന്നു

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | മലയാളം | [Română](README-ro.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

Flisk ലോക്കൽ ഡെവലപ്മെന്റിനുള്ള ഒരു കമാൻഡ്-ലൈൻ ടൂൾ ആണ്. നിങ്ങളുടെ ആപ്പിന്റെ ഓരോ ഭാഗവും (API, വെബ്സൈറ്റ്, വർക്കർമാർ, AI ഏജന്റുകൾ, ഡാറ്റാബേസ്) നിങ്ങളുടെ കമ്പ്യൂട്ടറിൽ ഒരൊറ്റ ലോക്കൽ വിലാസത്തിന് പിന്നിൽ ഇത് പ്രവർത്തിപ്പിക്കുകയും, ഒരു ഭാഗം സേവ് ചെയ്യുമ്പോൾ അത് റീലോഡ് ചെയ്യുകയും ചെയ്യുന്നു. ഓരോ ഭാഗവും ഒരു ചെറിയ `service.json`-ൽ നിങ്ങൾ വിവരിക്കുന്നു; അതിൽ നിന്ന് Flisk Dockerfile-കളും Compose ഫയലും Tiltfile-ഉം എഴുതുകയും അവ സമന്വയത്തിൽ നിലനിർത്തുകയും ചെയ്യുന്നു. ഇത് ഡിപ്ലോയ് ചെയ്യുന്നില്ല: പ്രൊഡക്ഷൻ നിങ്ങളുടെ സ്വന്തം ടൂളുകളുടെ കൈയിൽ തന്നെ തുടരും.

ദ്രുത ആരംഭം:

```bash
# npm install -g @flisk-sh/flisk
mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk resource shop-web --type frontend --stack shop --yes
flisk up shop
```

പൂർണ്ണ ഗൈഡ് [ഇംഗ്ലീഷ് README](../README.md)-ൽ ഉണ്ട്.

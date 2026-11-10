# Flisk: تطبيقك بالكامل يعمل على حاسوبك بأمر واحد

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | العربية | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md) | [Română](README-ro.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

Flisk أداة سطر أوامر للتطوير المحلي. تشغّل كل جزء من تطبيقك (API، الموقع، العمّال، وكلاء الذكاء الاصطناعي، قاعدة البيانات) على حاسوبك خلف عنوان محلي واحد، وتعيد تحميل الجزء عند حفظه. تصف كل جزء في ملف `service.json` صغير، ومنه يكتب Flisk ملفات Dockerfile وملف Compose وTiltfile ويُبقيها متزامنة. لا ينشر Flisk تطبيقك: يبقى الإنتاج بيد أدواتك الخاصة.

البداية السريعة:

```bash
npx @flisk-sh/flisk demo
```

تريد اختيار مجموعتك بنفسك؟ أجب عن بضعة أسئلة باستخدام مفاتيح الأسهم وEnter:

```bash
npx @flisk-sh/flisk create
```

```bash
mkdir my-shop && cd my-shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk resource shop-web --type frontend --stack shop --yes
flisk up shop
```

## المتطلبات المسبقة (تُثبَّت مرة واحدة)

| الأداة | الإصدار | التثبيت | مطلوبة من أجل |
|------|---------|---------|------------|
| **بيئة تشغيل تطبيقك** | ما يستخدمه تطبيقك | Node.js، Python، Go، Bun، ... | كل المسارات: هي التي تشغّل شيفرتك |
| **Node.js** | 22.12+ | [nodejs.org](https://nodejs.org/) | التثبيت عبر npm (`npm install -g @flisk-sh/flisk`) |
| **Docker** | Engine 25+، Compose 2.20.2+ | [docker.com](https://www.docker.com/products/docker-desktop/) | مسار Docker وTilt فقط |
| **Tilt** | 0.25+ | `curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh \| bash` | مسار Docker وTilt فقط |
| **Bun** | 1.2+ | `curl -fsSL https://bun.sh/install \| bash` | التثبيت عبر Bun (`bun add -g @flisk-sh/flisk`)، أو خدمات JavaScript المولَّدة |

> **طريقتان للتشغيل.** المشروع الذي تعلن كل خدمة فيه عن `command` يشغّلها كعمليات محلية: لا تحتاج إلا إلى Flisk وبيئة تشغيل تطبيقك ([أبسط مسار](start/simplest.md)). أما قاعدة البيانات، أو عنوان واحد أمام كل الخدمات، أو الحاوية نفسها التي تنشرها، فتحتاج إلى Docker وTilt. يفحص `flisk doctor` ما يستخدمه مشروعك فقط.

خطوات تجهيز جهازك بالتفصيل: [macOS](setup/macos.md) | [Ubuntu](setup/linux.md) | [Windows (WSL2)](setup/windows.md).

## التثبيت

ثبّت أداة سطر الأوامر عبر npm:

```bash
npm install -g @flisk-sh/flisk
```

تحقق منها بالأمر `flisk --version`: يطبع رقم الإصدار. ثم افحص جهازك:

```bash
flisk doctor
```

يفحص `flisk doctor` ما يستخدمه مشروعك فقط، ويطبع طريقة إصلاح أي شيء ناقص.

طرق أخرى للتثبيت: [Bun](install/bun.md) | [ملف تنفيذي جاهز لا يحتاج Node.js ولا Bun](install/binary.md) | [صورة حاوية](install/container.md). للتحديث لاحقًا استخدم `flisk upgrade`، ولتثبيت إصدار محدد راجع [الترقية وتثبيت الإصدار](upgrading.md).

> [!IMPORTANT]
> احصل على Flisk من مستودع [flisk-sh/flisk](https://github.com/flisk-sh/flisk)، أو من حزمة npm
> [`@flisk-sh/flisk`](https://www.npmjs.com/package/@flisk-sh/flisk)، أو من [الموقع الرسمي](https://flisk.sh/).
> الاسم المشابه لمستودع أو ملف README المنسوخ لا يثبت أن التنزيل رسمي.

للدليل الكامل، راجع [README الإنجليزي](../README.md).

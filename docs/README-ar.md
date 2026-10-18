# TDK CLI — شغّل الخدمات على جهازك

[English](../README.md) · العربية · [لغات أخرى](../README.md#readme-languages)

### توقف عن ترك الذكاء الاصطناعي يخترع بنيتك التحتية المحلية.

تكتب نماذج اللغة منطق التطبيقات بإتقان، لكنها سيئة في صيانة البنية التحتية المحلية. كلما أعاد الذكاء الاصطناعي كتابة `Dockerfile` أو أخطأ في إعداد `Tiltfile` أو كسر `nginx.conf`، ضاع وقتك وعدد غير ضروري من رموز API.

**TDK CLI Core** يسد هذه الفجوة. أنت تكتب منطق تطبيق الويب، ويكتشف TDK مكدّسك تلقائياً ليُنشئ البيئة المحلية ويربطها ويديرها.

التثبيت:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

بدء سريع:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

للاطلاع على المتطلبات والترخيص واستكشاف الأخطاء وإصلاحها، راجع [README الإنجليزي](../README.md). الوثائق متاحة على [موقع TDK](https://tdk-landscape.github.io/tdk-website/).

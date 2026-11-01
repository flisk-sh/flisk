# Flisk: แอปทั้งหมดของคุณ รันบนคอมพิวเตอร์ของคุณด้วยคำสั่งเดียว

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | ไทย | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md) | [Română](README-ro.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

Flisk เป็นเครื่องมือบรรทัดคำสั่งสำหรับการพัฒนาในเครื่อง ช่วยรันทุกส่วนของแอปของคุณ (API, เว็บไซต์, worker, AI agent, ฐานข้อมูล) บนคอมพิวเตอร์ของคุณภายใต้ที่อยู่ในเครื่องเพียงหนึ่งเดียว และรีโหลดส่วนนั้นเมื่อคุณบันทึก คุณอธิบายแต่ละส่วนใน `service.json` ไฟล์เล็ก ๆ จากนั้น Flisk จะเขียน Dockerfile, ไฟล์ Compose และ Tiltfile ให้ และดูแลให้ตรงกันอยู่เสมอ Flisk ไม่ deploy ให้ — production ยังเป็นหน้าที่ของเครื่องมือของคุณเอง

เริ่มต้นอย่างรวดเร็ว:

```bash
npx @flisk-sh/flisk demo
```

คู่มือฉบับเต็มอยู่ใน [README ภาษาอังกฤษ](../README.md)

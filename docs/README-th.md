# TDK CLI — สร้างและรันทั้ง tech stack ของคุณ

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | ไทย | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | [Italiano](README-it.md) | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md)

จากโฟลเดอร์ว่างสู่ tech stack ที่รันอยู่ด้วยคำสั่งเดียว กำหนดแต่ละบริการใน `service.json` แล้วรัน `tdk up` ไม่ต้องใช้ Kubernetes บนเครื่อง

เริ่มต้นอย่างรวดเร็ว:

```bash
npm install -g @tdk-landscape/tdk-cli-core
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

คู่มือฉบับเต็มอยู่ใน [README ภาษาอังกฤษ](../README.md)

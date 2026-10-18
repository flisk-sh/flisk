# TDK CLI — เริ่มบริการบนเครื่องของคุณ

[English](../README.md) · ไทย · [ภาษาอื่น](../README.md#readme-languages)

### หยุดปล่อยให้ AI สร้างโครงสร้างพื้นฐานในเครื่องของคุณขึ้นมาเอง

LLM เขียนลอจิกแอปพลิเคชันได้ดีมาก แต่ดูแลโครงสร้างพื้นฐานในเครื่องได้ไม่ค่อยดี ทุกครั้งที่ AI เขียน `Dockerfile` ใหม่ ตั้งค่า `Tiltfile` ผิด หรือทำ `nginx.conf` เสีย คุณจะเสียเวลาและโทเคน API โดยไม่จำเป็น

**TDK CLI Core** เชื่อมช่องว่างนี้ คุณเขียนลอจิกเว็บแอป แล้ว TDK จะตรวจจับ stack ของคุณโดยอัตโนมัติ และสร้าง เชื่อม และจัดการสภาพแวดล้อมในเครื่องให้

ติดตั้ง:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

เริ่มต้นอย่างรวดเร็ว:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

ดูข้อกำหนด ใบอนุญาต และการแก้ไขปัญหาได้ใน [README ภาษาอังกฤษ](../README.md) เอกสารอยู่ที่[เว็บไซต์ TDK](https://tdk-landscape.github.io/tdk-website/)

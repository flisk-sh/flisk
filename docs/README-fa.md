# TDK CLI — سرویس‌ها را روی دستگاه خود اجرا کنید

[English](../README.md) · فارسی · [زبان‌های دیگر](../README.md#readme-languages)

### دیگر اجازه ندهید هوش مصنوعی زیرساخت محلی شما را حدس بزند.

مدل‌های زبانی در نوشتن منطق برنامه عالی‌اند، اما در نگهداری زیرساخت محلی ضعیف‌اند. هر بار که هوش مصنوعی یک `Dockerfile` را بازنویسی کند، یک `Tiltfile` را اشتباه تنظیم کند یا `nginx.conf` را خراب کند، وقت و توکن‌های API بی‌دلیل هدر می‌رود.

**TDK CLI Core** این شکاف را پر می‌کند. شما منطق برنامه وب را می‌نویسید و TDK پشته‌ی شما را خودکار شناسایی می‌کند تا محیط محلی را تولید، متصل و هماهنگ کند.

نصب:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

شروع سریع:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

برای پیش‌نیازها، مجوز و رفع اشکال، [README انگلیسی](../README.md) را ببینید. مستندات روی [وب‌سایت TDK](https://tdk-landscape.github.io/tdk-website/) است.

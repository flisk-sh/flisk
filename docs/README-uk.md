# TDK CLI — запуск сервісів на вашому комп'ютері

[English](../README.md) · Українська · [Інші мови](../README.md#readme-languages)

### Годі дозволяти ШІ вигадувати вашу локальну інфраструктуру.

LLM чудово пишуть логіку застосунків, але погано підтримують локальну інфраструктуру. Щоразу, коли ШІ переписує `Dockerfile`, неправильно налаштовує `Tiltfile` або ламає `nginx.conf`, ви витрачаєте час і зайві API-токени.

**TDK CLI Core** заповнює цю прогалину. Ви пишете логіку веб-застосунку, а TDK автоматично визначає стек і генерує, пов'язує та запускає локальне середовище.

Встановлення:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Швидкий старт:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Вимоги, ліцензію та усунення несправностей дивіться в [англійському README](../README.md). Документація на [сайті TDK](https://tdk-landscape.github.io/tdk-website/).

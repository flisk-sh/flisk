# TDK CLI — запуск сервисов на вашей машине

[English](../README.md) · Русский · [Другие языки](../README.md#readme-languages)

### Хватит, пусть ИИ придумывает вашу локальную инфраструктуру.

LLM отлично пишут логику приложений, но плохо поддерживают локальную инфраструктуру. Каждый раз, когда ИИ переписывает `Dockerfile`, неправильно настраивает `Tiltfile` или ломает `nginx.conf`, вы теряете время и расходуете лишние API-токены.

**TDK CLI Core** закрывает этот пробел. Вы пишете логику веб-приложения, а TDK автоматически определяет стек и генерирует, связывает и запускает локальное окружение.

Установка:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Быстрый старт:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Требования, лицензию и решение проблем смотрите в [английском README](../README.md). Документация доступна на [сайте TDK](https://tdk-landscape.github.io/tdk-website/).

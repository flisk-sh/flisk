# TDK CLI — uruchamiaj usługi na swoim komputerze

[English](../README.md) · Polski · [Więcej języków](../README.md#readme-languages)

### Przestań pozwalać AI wymyślać twoją lokalną infrastrukturę.

LLM świetnie piszą logikę aplikacji, ale słabo radzą sobie z utrzymaniem lokalnej infrastruktury. Za każdym razem, gdy AI przepisuje `Dockerfile`, źle konfiguruje `Tiltfile` albo psuje `nginx.conf`, tracisz czas i zużywasz niepotrzebne tokeny API.

**TDK CLI Core** wypełnia tę lukę. Piszesz logikę aplikacji webowej, a TDK automatycznie wykrywa twój stack i generuje, łączy oraz uruchamia lokalne środowisko.

Instalacja:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Szybki start:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Wymagania, licencję i rozwiązywanie problemów znajdziesz w [angielskim README](../README.md). Dokumentacja jest na [stronie TDK](https://tdk-landscape.github.io/tdk-website/).

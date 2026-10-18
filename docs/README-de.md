# TDK CLI — Dienste auf Ihrem Rechner starten

[English](../README.md) · Deutsch · [Mehr Sprachen](../README.md#readme-languages)

### Schluss damit, dass KI Ihre lokale Infrastruktur erfindet.

LLMs schreiben hervorragende Anwendungslogik, pflegen lokale Infrastruktur aber sehr schlecht. Wenn Ihre KI ein `Dockerfile` umschreibt, eine `Tiltfile` falsch konfiguriert oder eine `nginx.conf` kaputt macht, kostet das Zeit und unnötige API-Tokens.

**TDK CLI Core** schließt diese Lücke. Sie schreiben die Webanwendung, und TDK erkennt Ihren Stack automatisch und erzeugt, verknüpft und orchestriert die lokale Umgebung.

Installation:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Schnellstart:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Die vollständige Anleitung, einschließlich Anforderungen, Lizenz und Fehlerbehebung, finden Sie in der [englischen README](../README.md). Die Dokumentation liegt auf der [TDK-Website](https://tdk-landscape.github.io/tdk-website/).

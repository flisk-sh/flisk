# Flisk: tutta la tua app, in esecuzione sul tuo computer con un solo comando

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

[English](../README.md) | [简体中文](README-zh_cn.md) | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Türkçe](README-tr.md) | [Tiếng Việt](README-vi.md) | [ไทย](README-th.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Français](README-fr.md) | [Українська](README-uk.md) | [Polski](README-pl.md) | [Português (Brasil)](README-pt-BR.md) | [العربية](README-ar.md) | [فارسی](README-fa.md) | [Bahasa Indonesia](README-id.md) | Italiano | [Ελληνικά](README-el.md) | [മലയാളം](README-ml.md) | [Română](README-ro.md)

<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/daily?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>
<a href="https://trendshift.io/repositories/266432?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-266432" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/266432/weekly?language=Starlark" alt="flisk-sh%2Fflisk | Trendshift" width="250" height="55"/></a>

Flisk è uno strumento da riga di comando per lo sviluppo locale. Esegue ogni parte della tua app (API, sito web, worker, agenti IA, database) sul tuo computer dietro un unico indirizzo locale e ricarica una parte quando la salvi. Descrivi ogni parte in un piccolo `service.json`; Flisk ne genera i Dockerfile, il file Compose e il Tiltfile e li mantiene sincronizzati. Non fa il deploy: la produzione resta ai tuoi strumenti.

Avvio rapido:

```bash
npx @flisk-sh/flisk demo
```

Vuoi scegliere il tuo stack? Rispondi a qualche domanda con le frecce e Invio:

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

## Prerequisiti (da installare una volta)

| Strumento | Versione | Installazione | Serve per |
|------|---------|---------|------------|
| **Il runtime della tua app** | quello che usa la tua app | Node.js, Python, Go, Bun, ... | Ogni percorso: esegue il tuo codice |
| **Node.js** | 22.12+ | [nodejs.org](https://nodejs.org/) | Installazione con npm (`npm install -g @flisk-sh/flisk`) |
| **Docker** | Engine 25+, Compose 2.20.2+ | [docker.com](https://www.docker.com/products/docker-desktop/) | Solo per il percorso Docker + Tilt |
| **Tilt** | 0.25+ | `curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh \| bash` | Solo per il percorso Docker + Tilt |
| **Bun** | 1.2+ | `curl -fsSL https://bun.sh/install \| bash` | Installazione con Bun (`bun add -g @flisk-sh/flisk`) o servizi JavaScript generati |

> **Due modi di esecuzione.** In un progetto in cui ogni servizio dichiara un `command`, i servizi girano come processi locali: ti servono solo Flisk e il runtime della tua app ([percorso più semplice](start/simplest.md)). Un database, un unico indirizzo per tutti i servizi o lo stesso container che usi in produzione richiedono [Docker](start/words.md#docker) e Tilt. `flisk doctor` controlla solo ciò che il tuo progetto usa.

Preparazione del computer passo per passo: [macOS](setup/macos.md) | [Ubuntu](setup/linux.md) | [Windows (WSL2)](setup/windows.md) | [Omarchy](setup/omarchy.md).

## Installazione

Installa la CLI con npm:

```bash
npm install -g @flisk-sh/flisk
```

Verifica con `flisk --version`: stampa un numero di versione. Poi controlla il tuo computer:

```bash
flisk doctor
```

`flisk doctor` controlla solo ciò che il tuo progetto usa e, per ogni cosa mancante, indica come rimediare.

Altri modi di installazione: [Bun](install/bun.md) | [binario precompilato, senza Node.js né Bun](install/binary.md) | [immagine container](install/container.md). Per installare tramite GitHub Packages invece che dal registro npm pubblico: [installazione da GitHub Packages](github-packages.md). Per aggiornare in seguito usa `flisk upgrade` (o il suo alias `flisk update`); per fissare una versione vedi [aggiornamento e blocco della versione](upgrading.md).

> [!IMPORTANT]
> Scarica Flisk solo dal repository [flisk-sh/flisk](https://github.com/flisk-sh/flisk), dal pacchetto npm
> [`@flisk-sh/flisk`](https://www.npmjs.com/package/@flisk-sh/flisk) o dal [sito ufficiale](https://flisk.sh/).
> Segui i link di installazione che trovi in queste fonti ufficiali. Un repository con un nome simile
> o un README copiato non garantisce che un download sia ufficiale.

La guida completa è nel [README in inglese](../README.md).

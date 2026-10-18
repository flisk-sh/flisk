# TDK CLI — avvia i servizi sulla tua macchina

[English](../README.md) · Italiano · [Altre lingue](../README.md#readme-languages)

### Smetti di lasciare che l'AI inventi la tua infrastruttura locale.

Gli LLM scrivono ottimamente la logica applicativa, ma gestiscono male l'infrastruttura locale. Ogni volta che l'AI riscrive un `Dockerfile`, configura male un `Tiltfile` o rompe un `nginx.conf`, perdi tempo e token API inutili.

**TDK CLI Core** colma questo divario. Tu scrivi la logica della web app, e TDK rileva automaticamente lo stack per generare, collegare e orchestrare l'ambiente locale.

Installazione:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Avvio rapido:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Per requisiti, licenza e risoluzione dei problemi, vedi il [README in inglese](../README.md). La documentazione è sul [sito di TDK](https://tdk-landscape.github.io/tdk-website/).

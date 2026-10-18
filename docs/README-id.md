# TDK CLI — jalankan layanan di mesin Anda

[English](../README.md) · Bahasa Indonesia · [Bahasa lain](../README.md#readme-languages)

### Berhenti membiarkan AI mengarang infrastruktur lokal Anda.

LLM sangat pandai menulis logika aplikasi, tetapi buruk dalam merawat infrastruktur lokal. Setiap kali AI menulis ulang `Dockerfile`, salah mengatur `Tiltfile`, atau merusak `nginx.conf`, Anda kehilangan fokus dan membuang token API yang tidak perlu.

**TDK CLI Core** menjembatani celah ini. Anda menulis logika aplikasi web, dan TDK otomatis mendeteksi stack Anda untuk menghasilkan, menghubungkan, dan mengatur lingkungan lokal.

Instalasi:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Mulai cepat:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Untuk persyaratan, lisensi, dan pemecahan masalah, lihat [README bahasa Inggris](../README.md). Dokumentasi tersedia di [situs web TDK](https://tdk-landscape.github.io/tdk-website/).

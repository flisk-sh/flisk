# TDK CLI — hizmetlerinizi kendi makinenizde başlatın

[English](../README.md) · Türkçe · [Diğer diller](../README.md#readme-languages)

### Yapay zekânın yerel altyapınızı uydurmasına izin vermeyi bırakın.

LLM'ler uygulama mantığını yazmakta çok iyi, ancak yerel altyapıyı yönetmekte çok zayıflar. Yapay zekânız bir `Dockerfile` dosyasını yeniden yazdığında, bir `Tiltfile` dosyasını yanlış yapılandırdığında veya bir `nginx.conf` dosyasını bozduğunda, odağınızı ve gereksiz API token'larınızı kaybedersiniz.

**TDK CLI Core** bu boşluğu kapatır. Web uygulamanızın mantığını yazarsınız; TDK yığınınızı otomatik olarak algılar ve yerel ortamı oluşturur, bağlar ve yönetir.

Kurulum:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Hızlı başlangıç:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Gereksinimler, lisans ve sorun giderme için [İngilizce README](../README.md) dosyasına bakın. Belgeler [TDK web sitesinde](https://tdk-landscape.github.io/tdk-website/) yer alır.

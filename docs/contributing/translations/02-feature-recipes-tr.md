# 2. Değişikliğiniz için rehberi izleyin

> Bu sayfa [02-feature-recipes.md](../02-feature-recipes.md) dosyasının çevirisidir. Farklılık olursa İngilizce sürüm geçerlidir.

Bu rehberler birer başlangıç noktasıdır. Bir dosyayı bulamazsanız komutu, yapılandırma anahtarını veya üretilen dosya adını depoda arayın ve issue üzerinden sorun.

## Bir CLI komutunu değiştirmek

1. Komutu `cli/src/commands/` altında bulun.
2. Testlerini `cli/src/commands/__tests__/` altında veya kaynak dosyanın yanında arayın.
3. Sorunu düzelten veya seçeneği ekleyen en küçük değişikliği yapın.
4. Komut veya seçenekleri kullanıcıya görünürse `cli/README.md` dosyasını güncelleyin.
5. Depo kökünden `bun run typecheck`, `bun run lint` ve `bun run test` çalıştırın.

Frontend framework'leri için özel [frontend provider rehberini](../../frontend-framework-providers.md) izleyin. React/Vue provider sınırını, engine şablonlarını, uyumluluk kontrollerini ve PR kontrol listesini açıklar.

## Bir veritabanı veya altyapı aracı eklemek

Önce neyi eklediğinizi belirleyin:

- **Bir servis tarafından kullanılan veritabanı**; servis manifestini, veritabanı URL üretimini, migration kurulumunu ve hazır olma kontrollerini etkileyebilir.
- **Paylaşılan yerel bir araç** (örneğin Redis veya NATS); isteğe bağlı özellik yapılandırmasını, üretilen Compose dosyalarını, Tilt kaynak kaydını, bağımlılıkları ve sağlık kontrollerini etkileyebilir.

Mevcut kodu bir harita gibi kullanın:

1. Paylaşılan altyapının nasıl yüklenip kaydedildiğini görmek için `engine/topologies/tilt/resources/infra-loader.star` dosyasından başlayın.
2. Veritabanı yaşam döngüsü örneği için `engine/topologies/tilt/resources/databases.star` dosyasına, Compose üretimi için `engine/topologies/platform/docker/compose/` klasörüne bakın.
3. İlgili özelliği veya manifest ayarını bulun ve doğrulandığı ve etkinleştirildiği yere kadar izleyin. Ayar adını `rg` ile arayın.
4. Yapılandırmayı, üretilen dosyaları, başlatma sırasını, sağlık/hazır olma durumunu, ortam değişkenlerini ve sırları, kapatma ve temizliği ve aracın devre dışı bırakıldığındaki davranışı kapsayan tüm yaşam döngüsünü izleyin.
5. Değiştirdiğiniz davranış için kontroller ekleyin. CLI ve Starlark üretici testleri `cli/src/commands/__tests__/` altında, Python engine testleri ise `tests/tilt-engine/` altındadır.
6. `docs/FEATURES.md` veya `cli/README.md` gibi kullanıcıya dönük özellik veya CLI belgelerini güncelleyin.

Yeni bir aracın yukarıdaki dosyaların tamamına ihtiyacı olduğunu varsaymayın. Özelliğinize en yakın mevcut uygulamayı izleyin ve paylaşılan servis davranışının çalışmaya devam etmesini sağlayın.

## Docker olmadan bir Starlark değişikliğini deneyin

Yalnızca Tilt kuruluyken herhangi bir engine fonksiyonunu çalıştırıp çıktısına bakabilirsiniz. Depo kökünde `try.Tiltfile` dosyasını oluşturun (git bu dosyayı yok sayar):

```python
load("engine/topologies/platform/docker/compose/compose.star", "generate_backend_compose_entry")

manifest = {"appType": "backend", "stack": "shop", "port": 4000, "appName": "orders-api"}
resource = {"name": "orders-api", "_resource_path": "services/shop/orders-api"}
manifest["_resource_path"] = resource["_resource_path"]

entry = generate_backend_compose_entry("services/shop", "orders-api", resource, manifest)
fail("OUTPUT\n" + entry)  # fail(), bir Tiltfile'ın Docker olmadan bir metni yazdırma yoludur
```

```bash
tilt alpha tiltfile-result -f try.Tiltfile
```

Üretilen Compose girdisi `Error in fail: OUTPUT` satırından sonra yazdırılır. `load()` içindeki yollar Tiltfile'a göre göreceli olduğundan dosyayı depo kökünde tutun. Manifesti değiştirin, yeniden çalıştırın ve karşılaştırın. `cli/src/commands/__tests__/` içindeki Starlark testleri (örneğin `stack-routers.test.ts`) da üretici çıktısını aynı yöntemle kontrol eder; yeni bir test eklediğinizde bunlardan birini kopyalayabilirsiniz.

## Engine veya servis keşfini değiştirmek

1. Tilt kaynak orkestrasyonu için `engine/topologies/tilt/resources/` klasöründen başlayın.
2. Docker, ağ oluşturma veya kalıcı durum için `engine/topologies/platform/` klasöründen başlayın.
3. Manifest tarama ve bağımlılık grafikleri için `discovery/` klasöründen başlayın.
4. Etkilenen çıktı dosyasını veya manifest alanını arayarak üreticisini ve testlerini bulun. CLI testleri Starlark üretici kontrollerini içerir.
5. Mevcut manifestlerin ve üretilmiş projelerin hâlâ çalışıp çalışmadığını kontrol edin. Davranış değiştiğinde şemayı, örnekleri veya CLI belgelerini güncelleyin.
6. Değişiklik sözleşmeleri veya birden fazla modülü etkiliyorsa önce bir [OpenSpec önerisi](01-first-change-tr.md) yazın.

`engine/AGENTS.md` ve diğer `AGENTS.md` dosyaları ajanlara yönelik çalışma notlarıdır. Yerel kodu açıklamaya yardımcı olabilirler, ancak ürün dokümantasyonu olarak kullanmadan önce yollarını ve önerilerini güncel kaynak kod ve testlere göre kontrol edin.

## Dokümantasyonu değiştirmek

1. En yakın mevcut sayfayı bulun ve onu güncelleyin; yeni bir kopya oluşturmayın.
2. Kısa başlıklar, numaralı adımlar ve kopyalanabilir komutlar kullanın.
3. Düzenlediğiniz dosyadaki göreli bağlantıları kontrol edin.
4. Yalnızca ilgili kontrolleri çalıştırın. Yalnızca dokümantasyon değişikliğinde, değiştirdiğiniz bağlantıları ve komutları kontrol etmeniz yeterlidir; CLI test paketini çalıştırmanız gerekmez.

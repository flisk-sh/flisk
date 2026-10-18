# 3. Değişikliğinizi kontrol edin ve pull request açın

> Bu sayfa [03-open-a-pr.md](../03-open-a-pr.md) dosyasının çevirisidir. Farklılık olursa İngilizce sürüm geçerlidir.

## Değişikliğiniz için kontrolleri çalıştırın

Bir komut aksini belirtmedikçe kontrolleri depo kökünden çalıştırın.

| Değişiklik | Çalıştırılacak kontroller |
|---|---|
| CLI kodu veya üretilen CLI davranışı | `bun run typecheck`, `bun run lint`, `bun run test` |
| CLI testlerinde kullanılan engine/Starlark üreticisi | `bun run typecheck`, `bun run lint` ve `cd cli && TDK_REQUIRE_TILT=1 npm test` çalıştırın. CI test işi Tilt'i kurar ve bu bayrağı ayarlar. |
| Python engine test alanı | Test bağımlılıklarını bir kez `python3 -m pip install -r tests/requirements.txt` ile kurun, ardından ilgili test dosyasını `pytest` ile veya bu test grubu için `make test-tilt-engine` ile çalıştırın. Bazı testler temiz bir checkout'ta da başarısız olabilir; hangileri ve neden olduğu için #700'e bakın. Bu Python kontrolleri `.github/workflows/ci.yml` tarafından çalıştırılmaz. |
| Yalnızca dokümantasyon | Değiştirdiğiniz bağlantıları ve komutları kontrol edin; sayfayı yeni başlayan biri gibi bir kez baştan sona okuyun. |

Bir kontrolü çalıştırmadıysanız geçtiğini söylemeyin. Çalıştıramıyorsanız bunu ve nedenini belirtin.

### Golden çıktı testi başarısız olursa

Üç örnek projeden üretilen Tilt ve Compose dosyaları `cli/src/generator/__tests__/golden/` içindeki kayıtlı kopyalarla karşılaştırılır. `cli/templates/` içindeki bir şablonu veya üreticiyi bilerek değiştirdiyseniz test başarısız olur ve değişen her dosyayı listeler. Değişikliği kabul etmek için `UPDATE_GOLDEN=1 bun run test -- golden-generated-output` komutunu çalıştırın, golden dosyalarının farkını okuyun ve değişikliğinizle birlikte commit edin. Üretilen çıktıyı değiştirmek istemediyseniz dosyaları güncellemek yerine nedeni düzeltin. Mevcut projeler de aynı bayt değişikliğini görür; bu nedenle bir sonraki `tdk config regenerate` çalıştırmasına kadar `tdk config verify` onları senkron dışı olarak raporlar. Bunu PR'da belirtin.

## Neyin değiştiğini gösterin

Bir hata düzeltmesi veya davranış değişikliği için mümkünse `main` ve kendi dalınızda aynı adımları çalıştırın. Gerçek önce-sonra çıktısını yapıştırın; hafızanızdan yeniden oluşturmayın. Komutu, projeyi veya test verisini ve tekrarlamak için gereken kurulumu ekleyin. Issue'da adı geçen boş, hata veya kurtarma durumlarını da kapsayın.

Derlenmiş CLI giriş noktasını test ediyorsanız eski derlenmiş dosyaları kullanmamak için önce `bun run build` çalıştırın. `tdk ui` gibi etkileşimli komutları gerçek bir terminalde kontrol edin. Otomatik test yoksa nedenini açıklayın ve testi eklemek için bir issue bağlayın. Yeni davranış ve hata düzeltmeleri aynı pull request içinde testler gerektirir; ayrıntılar için [CONTRIBUTING.md içindeki testlere](../../../CONTRIBUTING.md#tests) bakın.

## Dalınızı gönderin

Depoya yazma yetkiniz varsa:

```bash
git add path/to/your/files
git commit -m "Describe the change"
git push -u origin my-change
```

Bir fork'tan katkı yapıyorsanız fork'unuza gönderin ve pull request'i o daldan açın.

## Pull request açın

GitHub'da depoya gidin. Dalınız için **Compare & pull request** düğmesine tıklayın ya da **Pull requests → New pull request** seçeneğini kullanın. Temel dal olarak `main` seçin ve şunları doldurun:

```markdown
## What changed
<!-- One or two sentences. Link the issue with Fixes #123 when applicable. -->

## How I checked it
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] Other check: ...

## Evidence
<!-- Paste useful output or show before/after behavior. Say what you did not check. -->
```

Geçerli olmayan kontrol listesi maddelerini silin. Bir incelemecinin değişikliği görmesine yardımcı olacaksa ekran görüntüsü veya gerçek terminal çıktısı ekleyin. Parolaları, token'ları, özel URL'leri veya kişisel dosya yollarını asla eklemeyin.

## "Create pull request" düğmesine tıklamadan önce

- [ ] PR tek bir ana işi yapıyor.
- [ ] Issue'yu bağladım veya değişikliğin neden yararlı olduğunu açıkladım.
- [ ] Değişiklikten etkilenen belgeleri veya örnekleri güncelledim.
- [ ] Gerçekten çalıştırdığım kontrolleri listeledim ve eksikleri belirttim.
- [ ] Davranış değiştiyse önce-sonra kanıtını ekledim.

PR'ı açtıktan sonra GitHub CI çalıştırır. Bir kontrol başarısız olursa logunu okuyun, sorunu aynı dalda düzeltin, yeniden gönderin; PR otomatik güncellenir. Ardından PR'da inceleyicilerin sorularını yanıtlayın.

GitHub ayrıca PR açıklamanızın sonuna **Grok**, **Claude** ve **Codex** düğmeleri ekler. Birine tıklayarak, başkaları bakmadan önce kendi PR'nız için bir AI incelemesi alabilirsiniz. [Pull request incelemesi](04-review-a-pr-tr.md) düğmelerin nasıl çalıştığını ve incelemecilerin nasıl onaylayıp değişiklik istediğini açıklar.

## GitHub'ın çalıştırdıkları

[PR şablonu](../../../.github/pull_request_template.md), değiştirdiğiniz alanları seçmenizi ister ve her alan için kısa talimatlar açar. GitHub ayrıca değişen yollara göre eşleşen `area:*` etiketleri ekler ve güncellenmiş bir diff gönderdiğinizde eski alan etiketlerini kaldırır. Etiketler PR'yi düzenler; hangi otomasyonun çalışacağını iş akışı yol kuralları belirler.

- **Her pull request:** [CI](../../../.github/workflows/ci.yml) lint, typecheck, CLI testleri ve package smoke kontrolünü çalıştırır. Bazı ek CI işleri hangi dosyaların değiştiğine veya depo ayarlarına bağlıdır.
- **Çalışma zamanı dosyaları değiştiyse:** PR `cli/`, `engine/` veya `discovery/` altındaki dosyaları ya da `Tiltfile`, `package.json` veya o iş akışı dosyasını değiştirdiğinde Quickstart E2E da çalışır.
- **Framework örneği:** Vue, React veya başka bir provider eklemek `cli/` ve `engine/` dosyalarını değiştirir; bu yüzden her zaman çalışan CI ve Quickstart E2E birlikte çalışır.
- **Yalnızca dokümantasyon değişikliği:** Her zaman çalışan CI yine çalışır. Quickstart E2E, PR listelenen yollardan birini de değiştirmedikçe çalışmaz.

Diğer örnek uygulamalar ve 100 servisli fixture-bench kontrolleri her PR'da değil, bir zamanlamaya göre veya manuel istekle çalışır. Bir iş akışının tetikleyici yollarını `.github/workflows/` içindeki dosyanın en üstünde görebilirsiniz.

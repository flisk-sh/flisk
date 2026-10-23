# 4. Bir pull request'i inceleyin

> Bu sayfa [04-review-a-pr.md](../04-review-a-pr.md) dosyasının çevirisidir. Farklılık olursa İngilizce sürüm geçerlidir.

Herkes bir pull request'i inceleyebilir. Her inceleme aynı kurallara uyar:

1. İlk kontrol için bir AI inceleme düğmesi kullanın.
2. yapay zekânın söylediği her noktayı diff ile kendiniz karşılaştırın.
3. Kendi incelemenizi GitHub'da gönderin ve neleri kontrol ettiğinizi yazın.

Gönderdiğiniz incelemeden sorumlu olan AI değil, sizsiniz.

## İlk incelemeden önce: zorunlu okuma

İncelemeden önce bunları okuyun. Toplam yaklaşık bir saat sürer ve bunu yalnızca bir kez yaparsınız. Bunlar olmadan yapay zekânın yorumlarının doğru olup olmadığını anlayamazsınız.

**Flisk nedir**

- [ ] [README](../../../README.md): Flisk'nın ne yaptığı ve insanların hangi komutları kullandığı.
- [ ] [Proje genel bakışı](../../project-overview.md): Project → Stack → Resource modeli.
- [ ] [Kapsam](../../scope.md): Flisk'nın ne için olduğu ve ne için olmadığı.
- [ ] [Üretilen dosyalar](../../generated-files.md): Flisk'nın yazdığı dosyalar. Üretilen dosyaları asla elle düzenlemeyin; onları üreten girdiyi değiştirin.

**Nasıl çalışıyoruz**

- [ ] [Katkı rehberi](../../../CONTRIBUTING.md): etiketler, issue sahipliği ve DCO imzası.
- [ ] [1. Değişikliğe hazırlanın](01-first-change-tr.md): bir değişikliğin ne zaman OpenSpec önerisi gerektirdiği.
- [ ] [2. Değişiklik türüne göre rehberler](02-feature-recipes-tr.md): kodun nerede olduğu ve her değişikliğin hangi kontrolleri gerektirdiği.
- [ ] [3. Pull request açın](03-open-a-pr-tr.md): iyi bir PR'da neler olması gerektiği; önce-sonra kanıtı dahil.

**Herkesin uyduğu kurallar**

- [ ] [Davranış kuralları](../../../CODE_OF_CONDUCT.md): incelemelerde birbirimizle nasıl konuştuğumuz.
- [ ] [Güvenlik politikası](../../../SECURITY.md): güvenlik sorunlarını özel olarak bildirin, asla PR yorumunda bildirmeyin.
- [ ] [Yönetişim](../../../GOVERNANCE.md) ve [Bakımcılar](../../../MAINTAINERS.md): kimin karar verdiği ve kimin birleştirdiği.

Sonra bir kez deneyin: [hızlı kurulumu](../../../CONTRIBUTING.md#quick-setup) çalıştırın; böylece bir PR'ı checkout edip kontrollerini kendiniz çalıştırabilirsiniz.

## Kısa özet

1. PR'ı GitHub'da açın ve açıklamasının sonuna kadar kaydırın.
2. **Review this PR in** altındaki **Grok**, **Claude** veya **Codex** düğmesine tıklayın.
3. yapay zekânın cevabını okuyun. Her noktayı diff ile kendiniz karşılaştırın.
4. PR'da **Files changed**, ardından **Review changes** (sağ üstte; bazı düzenlerde **Submit review**) seçeneğine tıklayın.
5. Yorumunuzu yazın, **Comment**, **Approve** veya **Request changes** seçeneğini işaretleyin ve **Submit review** düğmesine tıklayın.

## AI bir inceleyici değil, yardımcınızdır

AI düğmeleri bir AI asistanıyla sohbet açar. Bu asistan size aittir: kendi hesabınızda size yanıt verir ve sohbet PR yazarı veya diğer inceleyicilerle paylaşılmaz. GitHub'a hiçbir şey göndermez, hiçbir şeyi onaylamaz ve kodu değiştirmez.

İnceleyici sizsiniz. Sayılan, GitHub'da kendi adınızla gönderdiğiniz incelemedir. Bu yüzden:

- **Kopyalamadan önce kontrol edin.** AI yanılabilir. Diff'te olmayan bir sorun uydurabilir veya gerçek bir sorunu kaçırabilir. Belirttiği dosyayı ve satırı açıp kendiniz doğrulayın.
- **Kendi cümlelerinizle yazın.** Yalnızca kontrol edip katıldığınız noktaları yapıştırın. Gerisini silin.
- **Kontrol etmediklerinizi söyleyin.** "Kodu okudum ama çalıştırmadım" da faydalı bir incelemedir.
- **Sohbete asla gizli bilgi yapıştırmayın.** Token'lar, parolalar ve özel URL'ler AI sohbetine veya PR yorumlarına ait değildir.

## AI inceleme düğmeleri nasıl çalışır

Biri bir PR'ı açtığında, yeniden açtığında veya düzenlediğinde [AI inceleme düğmeleri iş akışı](../../../.github/workflows/ai-review-buttons.yml) PR açıklamasının sonuna bu bölümü ekler:

> **Review this PR in**
> \[Grok\] \[Claude\] \[Codex\]

Her düğme basit bir bağlantıdır. yapay zekânın sitesini yeni bir sekmede açar ve bu mesaj zaten yazılmış olarak gelir.

```text
Review this pull request. Read the title and diff at https://github.com/flisk-sh/flisk/pull/123.
```

| Düğme | Açılan site |
|---|---|
| **Grok** | grok.com |
| **Claude** | claude.ai |
| **Codex** | chatgpt.com |

Zaten kullandığınızı seçin. Hepsi aynı mesajı alır. Her site oturum açmanızı isteyebilir; bundan sonra sohbet boş açılırsa düğmeye yeniden tıklayın. Oturum açmadıysanız yukarıdaki mesajı kopyalayın, PR'ın bağlantısını ekleyin ve herhangi bir AI sohbetine yapıştırın.

Bilmeniz gerekenler:

- **CI'da hiçbir şey çalışmaz.** İş akışı yalnızca bağlantıları açıklamaya yazar. Tıklayana kadar AI çağrılmaz.
- **Metniniz güvendedir.** Bu bölüm yazarın metninden sonra eklenir ve onu asla değiştirmez. Yazar aynı anda açıklamayı düzenliyorsa iş akışı üzerine yazmak yerine güncellemeyi atlar.
- **Düğmeler yok mu?** PR açıklamasını düzenleyip kaydedin (küçük bir değişiklik yeterlidir); iş akışı düğmeleri ekler. Bakımcılar **Actions** sekmesinden iş akışını elle çalıştırarak açık olan her PR'a düğme ekleyebilir.

### Daha iyi takip soruları sorun

İlk cevap bir özettir. Daha kullanışlı bir inceleme için takip soruları sorun:

- "Hangi değişiklik mevcut kullanıcıları bozabilir? Dosyayı ve satırı gösterin."
- "Bu diff'teki bir şeyde test eksik mi?"
- "PR açıklaması kodun gerçekte yaptığı işle eşleşiyor mu?"
- "`cli/src/commands/up.ts` dosyasının 40–60. satırlarını projeye yeni başlayan biri gibi açıklayın."
- "Emin olduğunuz sorunlar için kısa ve samimi bir inceleme yorumu yazın."

### Birleştirme çakışması düğmeleri

Bir PR `main` ile çakışırsa [AI çakışma düğmeleri iş akışı](../../../.github/workflows/ai-conflict-buttons.yml) PR'a Grok, Claude ve Codex için **Resolve conflict** düğmeleri olan tek bir yorum bırakır. Bu düğmeler AI'ye `main`'i dala birleştirmek ve düzeltmeyi göndermek için adım adım talimatlar verir. AI o dala gönderemezse (örneğin sahibi olmadığınız bir fork), talimatlar bunun yerine bir `fix/<PR numarası>-conflict` dalına göndermesini ve bir yedek PR açmasını söyler. Orijinal PR `Fixes #N` içeriyorsa yedek PR da bunu içerir. Sonucu diğer değişiklikler gibi kontrol edin ve orijinal PR'a yedek PR'ın bağlantısını içeren bir yorum bırakın. Çakışma çözüldüğünde aynı yorum bunu belirtecek şekilde değişir ve düğmeler kaybolur.

## Neye bakmalısınız

Her şeyi kontrol etmeniz gerekmez. Yapabildiğinizi seçin ve neleri kapsadığınızı söyleyin.

- [ ] **Açıklamada yazdığı gibi mi çalışıyor?** Başlığı ve "What changed" bölümünü diff ile karşılaştırın.
- [ ] **Tek ve odaklı bir değişiklik mi?** İlgisiz düzenlemeler ayrı bir PR olmalıdır.
- [ ] **Kanıt var mı?** Bir düzeltme veya davranış değişikliği için PR gerçek önce-sonra çıktısını göstermelidir ([Değişikliği gösterin](03-open-a-pr-tr.md) bölümüne bakın).
- [ ] **Kontroller yeşil mi?** **Conversation** sekmesinin altındaki kontrollere bakın. Kırmızı bir kontrolün düzeltilmesi veya açıklanması gerekir.
- [ ] **Belgeler güncellendi mi?** Yeni bir seçenek veya değişen bir komut, belgelerinin de değişmesini gerektirir.
- [ ] **Riskli bir şey var mı?** Gizli bilgiler, silinen dosyalar, değişen varsayılanlar veya yeni bir bağımlılık bir soruyu hak eder.
- [ ] **Anlayabiliyor musunuz?** Yeni biri olarak kodu takip edemiyorsanız bunu söyleyin. Bu da değerli bir geri bildirimdir.

## Satırlara yorum bırakın

1. **Files changed** sekmesini açın.
2. Bir satırın üzerine gelin ve beliren mavi **+** düğmesine tıklayın. Birden fazla satır seçmek için sürükleyin.
3. Yorumunuzu yazın.
4. **Start a review** (zaten başlattıysanız **Add review comment**) düğmesine tıklayın. Bu, yorumlarınızı gönderene kadar taslak olarak tutar; yazar çok sayıda değil tek bir bildirim alır.

**Add single comment** hemen yayımlar. Kısa bir soru için kullanın, tam bir inceleme için değil.

Kesin bir düzeltme önermek için yorum kutusundaki **±** simgesine (**Insert a suggestion**) tıklayın ve bloğun içindeki kodu düzenleyin. Yazar tek tıkla uygulayabilir.

## İncelemenizi gönderin

**Files changed** bölümünün sağ üstündeki **Review changes** düğmesine tıklayın, bir özet yazın ve üç seçenekten birini seçin.

### Comment: karar içermeyen geri bildirim

Sorularınız veya küçük notlarınız olduğunda ya da PR'ın yalnızca bir kısmını kontrol ettiğinizde **Comment** seçin.

```markdown
Read the CLI changes; did not run them.

Question: what happens when `--port` is 0? The help text does not say.
```

### Approve: "hazır", notlarla birlikte

PR'ı kontrol ettiğinizde ve birleştirmek için uygun olduğunu düşündüğünüzde **Approve** seçin. Onaylayıp yine de küçük yorumlar bırakabilirsiniz. Bunları yazarın birleştirmeyi engellemediğini bilmesi için açıkça isteğe bağlı olarak işaretleyin.

```markdown
Looks good. I ran `bun run test` on this branch and tried `flisk up --dry-run` in the restaurant example: the new URLs show up as described.

Optional (nit): `parsePort` could use a test for an empty string. Fine to do in a follow-up.
```

### Request changes: "henüz değil", nedenleriyle

Birleştirmeden önce mutlaka düzeltilmesi gereken bir şey olduğunda **Request changes** seçin. GitHub'da bir PR'ı reddetmenin yolu budur: PR'ı kapatmaz, yazara neyi düzeltmesi gerektiğini söyler. Neyin yanlış olduğunu, nerede olduğunu ve neyin kabul edilebilir olacağını her zaman belirtin.

```markdown
Thanks for this! Two things need fixing before merge:

1. `cli/src/commands/up.ts` line 52: the new flag is read but never passed to the generator, so `--no-cache` has no effect. Could you pass it through and add a test?
2. The README still shows the old flag name `--nocache`.

Everything else looks good. Happy to re-review once these are in.
```

Yazar bir düzeltme gönderdiğinde **Files changed** sekmesini yeniden açın, yeni commit'leri kontrol edin ve yeni bir inceleme gönderin. Sorunlar çözüldüyse **Approve** seçin. Yeni bir inceleme gönderene kadar eski "changes requested" durumu PR'da kalır.

### PR'ı kapatmak

Değişiklik istemek, kapatmakla aynı şey değildir. PR'ları yalnızca bakımcılar kapatır; genellikle değişiklik kabul edilmeyeceğinde veya yazar yanıt vermeyi bıraktığında. Bir PR'ın kapatılması gerektiğini düşünüyorsanız bir **Comment** içinde nedenini yazın ve kararı bakımcılara bırakın.

## Nazik ve net yorumlar yazın

- Yalnızca neyin yanlış olduğunu değil, neyin iyi olduğunu da söyleyin.
- Somut olun: dosyayı ve satırı belirtin ve nedenini açıklayın.
- Emir vermek yerine soru sorun: "Change this." yerine "Could this be…?" daha iyi çalışır.
- Küçük şeyleri `nit:` veya `optional:` ile etiketleyin; yazarın birleştirmeyi engellemediğini bilmesi için.
- Kişiyi değil, kodu inceleyin.

Her yorumda [Davranış kurallarına](../../../CODE_OF_CONDUCT.md) uyun.

## Terminalden (isteğe bağlı)

[GitHub CLI](https://cli.github.com) ile aynı işlemleri terminalinizden de yapabilirsiniz:

```bash
gh pr checkout 123
```

```bash
gh pr review 123 --comment --body "Read the CLI changes; did not run them."
```

```bash
gh pr review 123 --approve --body "Ran bun run test on this branch; looks good."
```

```bash
gh pr review 123 --request-changes --body "The new flag is never passed to the generator (up.ts line 52)."
```

## Kim onaylayabilir ve birleştirebilir

- Herkes yorum yapabilir, onaylayabilir veya değişiklik isteyebilir. Her inceleme bakımcıların daha hızlı karar vermesine yardımcı olur.
- Kendi PR'nızı onaylayamazsınız.
- Yalnızca [bakımcılar](../../../MAINTAINERS.md) birleştirir. Birleştirmeden önce incelemeleri ve gerekli kontrollerin geçtiğini doğrularlar.

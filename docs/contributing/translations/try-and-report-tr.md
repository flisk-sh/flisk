# TDK'yi deneyin ve gördüklerinizi bildirin

> Bu sayfa [try-and-report.md](../try-and-report.md) dosyasının çevirisidir. Farklılık olursa İngilizce sürüm geçerlidir.

Kod yazmanıza veya cilalı bir hata raporu hazırlamanıza gerek yok. Bu sayfa TDK'yi nasıl kuracağınızı, bir örneği nasıl çalıştıracağınızı ve kısa bir formla neler olduğunu nasıl bildireceğinizi gösterir. Ham notlar da olabilir: gerçek sayılar içeren yarım bir rapor, hiç rapor olmamasından çok daha yardımcıdır.

[Formu açın](https://github.com/flisk-sh/tdk-cli-core/issues/new?template=try-it-and-report.yml). Üç kısa zorunlu sorusu vardır (ne denediğiniz, nasıl gittiği ve ne gördüğünüz); geri kalanı isteğe bağlıdır.

## 1. Kurulum

Docker'ın (Desktop, OrbStack veya Colima) çalışıyor olması ve Tilt 0.25.0 veya daha yeni bir sürümün kurulu olması gerekir. Ardından TDK CLI'ı kurun:

```bash
curl -fsSL https://flisk-sh.github.io/tdk-landscape.github.io/install.sh | sh
tdk --version
```

`tdk --version` çıktısını formun "Your setup" kutusuna kopyalayın. Kurulum başarısız olursa bu da faydalı bir rapordur: hatayı yapıştırın ve işletim sisteminizi yazın.

## 2. Örneği alın

```bash
git clone https://github.com/flisk-sh/tdk-cli-core.git
cd tdk-cli-core/examples/one-backend-python
```

Örnek tek bir FastAPI servisidir. Tam açıklama için kendi [README](../../../examples/one-backend-python/README.md) dosyasına bakın.

## 3. Çalıştırın

```bash
tdk project --yes
time tdk up one-backend-python
```

`tdk up` yalnızca her servis hazır olduğunda `TDK is up.` yazdırır; bu yüzden `time`'ın yazdırdığı `real` satırı, imaj derlemesi ve bağımlılık kurulumu dahil ilk başlatma süresinizdir. Servisin yanıt verip vermediğini kontrol edin:

```bash
curl --fail http://api.one-backend-python.localhost/api/api-backend/health
# {"status":"ok","service":"api-backend"}
```

80 numaralı port meşgulse TDK başka bir port seçer. Hangisi olduğunu `tdk doctor --json` gösterir.

Bir şey başarısız olursa `tdk status` ve `tdk doctor` çalıştırın ve yazdırdıklarını yapıştırın. Her şeyi durdurmak için `tdk down` çalıştırın.

## 4. İsteğe bağlı: eksik zamanlamalar

Bu üç sayı, [issue 683](https://github.com/flisk-sh/tdk-cli-core/issues/683) için beklediğimiz verilerdir. İstediğiniz kadarını yapın ve atladıklarınızı belirtin.

**İlk başlatma.** 3. adımdaki `time tdk up` sonucu.

**Sıcak başlatma.** Yığını durdurun ve yeniden başlatın. İmaj zaten derlenmiştir, bu yüzden daha hızlı olmalıdır:

```bash
tdk down
time tdk up one-backend-python
```

**Kaydetmeden hazır olmaya.** Tek bir satırı değiştirin ve servisin değişikliği sunmasına kadar geçen süreyi ölçün. `/health` tarafından döndürülen `ok` kelimesini değiştiriyoruz. Örnek README bugün her düzenlemenin imajı yeniden derlediğini söylüyor; bu nedenle milisaniye değil saniyeler bekleyin. Görmek istediğimiz sayı budur:

```bash
now() { perl -MTime::HiRes=time -e 'printf "%.1f", time'; }
f=services/one-backend-python/api/src/main.py
perl -pi -e 's/"status": "ok"/"status": "changed"/' "$f"
start=$(now)
until curl -fs http://api.one-backend-python.localhost/api/api-backend/health | grep -q changed; do sleep 0.2; done
echo "save to ready: $(perl -e "printf '%.1f', $(now) - $start") s"
git checkout -- "$f"   # düzenlemeyi geri al
```

**`uvicorn --reload` ile karşılaştırın.** Aradaki farkı görebilmemiz için aynı değişikliği TDK olmadan çalıştırın. Bu, Python 3.12 veya daha yeni bir sürüm gerektirir. İkisinin CPU için yarışmaması için önce `tdk down` çalıştırın ve sanal ortamı projenin dışında tutun:

```bash
cd services/one-backend-python/api
python3 -m venv /tmp/uvicorn-venv && . /tmp/uvicorn-venv/bin/activate
pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0"
uvicorn main:app --app-dir src --port 4000 --reload
```

İkinci bir terminalde `.localhost` URL'si yerine `http://localhost:4000/health` kullanarak örnek klasöründeki "kaydetmeden hazır olmaya" adımını tekrarlayın. Bittiğinde Ctrl-C ile durdurun.

Issue'daki Postgres kısmı önemliyse, Postgres başlarken API tarafından kaydedilen bağlantı hatalarını da not edin. Bunları `tdk logs` gösterir.

## 5. Formu doldurun

[Formu](https://github.com/flisk-sh/tdk-cli-core/issues/new?template=try-it-and-report.yml) açın ve cevapları kendi cümlelerinizle yazın. Faydalı bir raporun neye benzediğine dair iki örnek (sayılar uydurulmuş, sadece açıklama içindir):

**İşe yaradı, sayılarla**

| Alan | Örnek |
|---|---|
| Ne denediniz? | examples/one-backend-python dosyasını çalıştırdım ve süresini ölçtüm |
| Nasıl geçti? | Çalıştı, ama bir şey yavaş ya da garipti |
| Ne gördünüz? | İlk `tdk up` 4 dk 10 sn. Sıcak `tdk up` 35 sn. Kaydetmeden hazır olmaya: TDK ile yaklaşık 6 sn, `uvicorn --reload` ile yaklaşık 1 sn. |
| Your setup | macOS 15, OrbStack, tdk 1.3.126 |

**Başarısız oldu**

| Alan | Örnek |
|---|---|
| Ne denediniz? | Yeni klonlanmış depoda `tdk up one-backend-python` |
| Nasıl geçti? | Başarısız oldu |
| Ne gördünüz? | Yaklaşık 2 dakika sonra `✗ api-backend failed` ile durdu. `tdk status` bunu hata olarak gösteriyor. |
| Yapıştırılan çıktı | `tdk up` ve `tdk status` tarafından yazdırılan metin |
| Your setup | WSL2 üzerinde Ubuntu 24.04, Docker Desktop, tdk 1.3.126 |

Raporu daha kolay işlenebilir kılan şeyler; hiçbiri zorunlu değil:

- İlk çalıştırma mı yoksa tekrar mı olduğunu belirtin.
- Ekran görüntüsü değil metin yapıştırın, böylece arayabiliriz.
- Yapıştırdığınız her şeyden parolaları ve token'ları çıkarın.
- Bir beklentiniz varsa neyi beklediğinizi yazın.

Issue'ya genellikle bir iş günü içinde yanıt vermeyi hedefliyoruz. Daha ileri gidip bilerek hata aramak isterseniz [TDK'de hata bulma](../finding-bugs.md) sayfasına bakın.

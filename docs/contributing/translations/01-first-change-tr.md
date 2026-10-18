# 1. Değişikliğe hazırlanın

> Bu sayfa [01-first-change.md](../01-first-change.md) dosyasının çevirisidir. Farklılık olursa İngilizce sürüm geçerlidir.

Tüm depoyu anlamanıza gerek yok. Küçük bir değişiklik seçin ve ilgili rehberi izleyin. Bir adım belirsizse issue üzerinden sorun.

Aşağıdaki adımları bir kez yapmanız yeterlidir. TDK CLI'ı ve kontrollerini çalıştırmak için gereken araçları kurar.

## En hızlı yol: Dev Container / Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/tdk-landscape/tdk-cli-core?quickstart=1)
[![Open in Dev Containers](https://img.shields.io/badge/Open%20in-Dev%20Containers-blue?logo=visualstudiocode)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/tdk-landscape/tdk-cli-core)
[![Open in Gitpod](https://img.shields.io/badge/Open%20in-Gitpod-908a00?logo=gitpod)](https://gitpod.io/#https://github.com/tdk-landscape/tdk-cli-core)
[![Open in Firebase Studio](https://img.shields.io/badge/Open%20in-Firebase%20Studio-4285F4?logo=firebase)](https://idx.google.com/import?url=https://github.com/tdk-landscape/tdk-cli-core)
[![Open in Replit](https://img.shields.io/badge/Open%20in-Replit-F26207?logo=replit)](https://replit.com/github/tdk-landscape/tdk-cli-core)
[![Open in DevPod](https://img.shields.io/badge/Open%20in-DevPod-1C1C1C?logo=devpod)](https://devpod.sh/open#https://github.com/tdk-landscape/tdk-cli-core)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-1269D3?logo=stackblitz)](https://stackblitz.com/github/tdk-landscape/tdk-cli-core)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-151515?logo=codesandbox)](https://codesandbox.io/p/github/tdk-landscape/tdk-cli-core)

Ya da depoyu klonlayın ve VS Code'da **Dev Containers: Reopen in Container** komutunu kullanın.

Varsayılan konteyner Node.js 22 ve Bun içerir ve başladıktan sonra `bun install` çalıştırır. Başladıktan sonra hemen şunları çalıştırabilirsiniz:

```bash
bun run typecheck
bun run lint
bun run test
```

Docker ve Tilt isteğe bağlıdır ve varsayılan konteynerde yoktur. Yalnızca TDK servislerini veya tam yerel ortamı çalıştırmanız gerekiyorsa ekleyin.

## Gerekenler (yerel kurulum)

- Git
- [Bun](https://bun.sh)
- Node.js 22.12 veya daha yeni
- Yalnızca TDK servislerini çalıştırmanız veya tam yerel ortamı kontrol etmeniz gerekiyorsa Docker ve [Tilt](https://docs.tilt.dev/install.html)

## Depoyu bilgisayarınıza kopyalayın

Bir terminal açın ve şunu çalıştırın:

```bash
git clone https://github.com/tdk-landscape/tdk-cli-core.git
cd tdk-cli-core
bun install
git switch -c my-change
```

`my-change` yerine kısa bir ad yazın, örneğin `docs-new-framework-guide`.

## Bir değişiklik bulun

1. [good first issue](https://github.com/tdk-landscape/tdk-cli-core/labels/good%20first%20issue) veya [help wanted issue](https://github.com/tdk-landscape/tdk-cli-core/labels/help%20wanted) listelerini açın.
2. Issue'yu okuyun ve birisinin zaten üzerinde çalışıp çalışmadığını kontrol edin.
3. `I'll take this` (veya `I would like this one`) yazarak yorum bırakın; bir bot size atama yapar ve `claimed` etiketini ekler. Issue yoksa, büyük bir özelliğe başlamadan önce değişikliği anlatan bir issue açın.
4. Olası dosyaları ve kontrolleri bulmak için [özellik rehberlerini](02-feature-recipes-tr.md) kullanın.

## Değişiklik önerisi ne zaman yazılır

Bir değişiklik kullanıcıya dönük bir sözleşmeyi, bir manifest veya üretilen bir formatı ya da birden fazla alt sistemi etkiliyorsa OpenSpec kullanın. [Vue provider değişikliği](../../../openspec/changes/archive/2026-09-28-add-vue-frontend-adapter/proposal.md), proposal, design, specs ve tasks içeren tamamlanmış bir örnektir. Makinenizde `openspec` komutu kurulu değilse, kapsamı geniş bir değişikliğe başlamadan önce issue'da sorun.

Depo kökünden çalıştırın:

```bash
openspec list
openspec new change "short-change-name"
openspec status --change "short-change-name"
```

OpenSpec'in yazdırdığı talimatları izleyerek gerekli proposal, design, specs ve tasks dosyalarını oluşturun. Yazım düzeltmesi, bağlantı düzeltmesi veya küçük izole bir değişiklik genellikle teklif gerektirmez.

## Hızlı bir kontrol çalıştırın

Depo kökünden CLI kontrolleri şunlardır:

```bash
bun run typecheck
bun run lint
bun run test
```

Son düzenlemeden sonra kontrolleri yeniden çalıştırın. Bir kontrol başarısız olursa hatayı PR'a ekleyin ve ne denediğinizi yazın. Alana özgü kontroller için [PR rehberine](03-open-a-pr-tr.md) bakın.

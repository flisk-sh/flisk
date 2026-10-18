# TDK CLI — démarrez vos services sur votre machine

[English](../README.md) · Français · [Plus de langues](../README.md#readme-languages)

### Arrêtez de laisser l'IA inventer votre infrastructure locale.

Les LLM écrivent très bien la logique applicative, mais maintiennent mal l'infrastructure locale. Chaque fois que votre IA réécrit un `Dockerfile`, mal configure un `Tiltfile` ou casse un `nginx.conf`, vous perdez du temps et des tokens d'API inutiles.

**TDK CLI Core** comble ce vide. Vous écrivez la logique de votre application web, et TDK détecte automatiquement votre stack pour générer, relier et orchestrer l'environnement local.

Installation :

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Démarrage rapide :

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Pour les prérequis, la licence et le dépannage, consultez le [README en anglais](../README.md). La documentation se trouve sur le [site TDK](https://tdk-landscape.github.io/tdk-website/).

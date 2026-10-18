# TDK CLI — inicia servicios en tu máquina

[English](../README.md) · Español · [Más idiomas](../README.md#readme-languages)

### Deja de dejar que la IA invente tu infraestructura local.

Los LLM escriben muy bien la lógica de aplicación, pero son malísimos manteniendo la infraestructura local. Cada vez que tu IA reescribe un `Dockerfile`, configura mal un `Tiltfile` o rompe un `nginx.conf`, pierdes concentración y gastas tokens de API innecesarios.

**TDK CLI Core** cierra esa brecha. Tú escribes la lógica de tu aplicación web, y TDK detecta tu stack automáticamente para generar, enlazar y orquestar el entorno local.

Instalación:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Inicio rápido:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Para requisitos, licencia y solución de problemas, consulta el [README en inglés](../README.md). La documentación está en el [sitio web de TDK](https://tdk-landscape.github.io/tdk-website/).

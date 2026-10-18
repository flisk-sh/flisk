# TDK CLI — inicie serviços na sua máquina

[English](../README.md) · Português (Brasil) · [Mais idiomas](../README.md#readme-languages)

### Pare de deixar a IA inventar sua infraestrutura local.

LLMs são excelentes em escrever lógica de aplicação, mas péssimos em manter infraestrutura local. Toda vez que sua IA reescreve um `Dockerfile`, configura errado um `Tiltfile` ou quebra um `nginx.conf`, você perde foco e gasta tokens de API desnecessários.

**TDK CLI Core** resolve isso. Você escreve a lógica da sua aplicação web, e o TDK detecta sua stack automaticamente para gerar, conectar e orquestrar o ambiente local.

Instalação:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Início rápido:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Para requisitos, licença e solução de problemas, veja o [README em inglês](../README.md). A documentação está no [site do TDK](https://tdk-landscape.github.io/tdk-website/).

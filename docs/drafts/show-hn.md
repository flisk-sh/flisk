# Show HN: Flisk CLI – service.json to a local Docker/Tilt stack, no cluster

Flisk CLI turns a `service.json` per service into a local Docker stack, with Tilt (the local development tool) watching services and live-updating containers as you code. It is not a deploy tool and not a Compose replacement. Production stays on Helm.

```sh
mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk up shop
```

Then open `http://api.shop.localhost:8080/api/orders/health`.

Flisk runs local development services through Docker and Tilt. It does not deploy to a cluster and does not replace Compose for a small stack you already maintain. Native Windows is inspect-only; landscape startup needs Ubuntu on WSL2.

The warm demo brings 14 tiny services healthy in 4.6s on a 16 GB M1 after images existed. Not a cold boot. Separately, 100 generated `/health` stubs, about 20 lines each, became healthy through Traefik in 472s on a clean Ubuntu runner; [that fixture run](https://github.com/flisk-sh/tdk-cli-core/actions/runs/36395860088) is not an ERP workload.

- Repo: https://github.com/flisk-sh/tdk-cli-core
- [Quickstart](https://tdk-landscape.github.io/tdk-website/docs/quickstart/)
- [Comparison and known limits](../compare-honest.md)
- [Claims registry](../claims.md)

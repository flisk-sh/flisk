# Idempotent consumer

A consumer that is safe to retry: Redis Streams (at-least-once) plus a Postgres inbox. The write-up, with what was run and
what was not, is [docs/recipes/idempotent-consumer.md](../../docs/recipes/idempotent-consumer.md).

```bash
cd examples/idempotent-consumer
flisk project --yes
flisk up                           # redis, postgres and the consumer
cd services/app/consumer
bun test                           # five scenarios against that Redis and Postgres
```

The tests use their own stream (`payments.test`) and start their own consumer processes, so they do not compete with the
consumer `flisk up` runs. Needs [Bun](https://bun.sh) 1.2.9 or newer (built-in Redis and Postgres clients), Docker, and free
host ports 5432 and 6379.

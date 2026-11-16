# Idempotent consumer: safe to retry, tested on a laptop

A broker promises **at-least-once**. After a crash or a rebalance your consumer gets a message it already handled. This recipe
shows one pattern that makes that harmless, and five tests that force the awkward cases without a staging cluster. It came
from [discussion #923](https://github.com/orgs/flisk-sh/discussions/923) and Pablo-aps's `PaymentCaptured` test.

Producer side (commit, then publish) is a different problem: see [#1012](https://github.com/flisk-sh/flisk/issues/1012). For a
webhook receiver over HTTP, see [Local webhooks](../local-webhooks.md).

## The pattern

In one database transaction, then acknowledge:

1. `INSERT INTO inbox (consumer, event_id) ... ON CONFLICT DO NOTHING`. No row inserted means this exact message was handled before: stop.
2. Record the business fact under its **natural key**: `ledger (provider_account, capture_id)`. A new event ID that describes the same capture adds nothing. Do not key on `payment_id` alone, or a legitimate second (partial) capture is dropped.
3. Move state forward only: `UPDATE ... WHERE new_rank > current_rank`. A late `Authorized` after `Captured` changes nothing.
4. `COMMIT`, **then** acknowledge the broker.

If the process dies between the commit and the ack, the broker redelivers and step 1 absorbs it. If it dies before the commit,
nothing was written and the redelivery does the work. Acknowledging before the commit loses the message instead.

The code is [`examples/idempotent-consumer`](../../examples/idempotent-consumer/README.md): `handler.ts` is the transaction,
`consumer.ts` is the read loop. The consumer name is fixed, so after a restart Redis hands it back its own unacknowledged messages first.

## The five tests

Run with `bun test`, against the Redis and Postgres that `flisk up` started:

| Test | Asserts |
| --- | --- |
| Same event delivered twice | ledger total 125 cents |
| New event ID, same capture | ledger total 125 cents |
| Second capture of the same payment | ledger total 250 cents |
| Older `Authorized` after `Captured` | payment stays `captured` |
| Consumer killed after commit, before ack | message still pending; after restart, ledger total 125 cents |

The last one uses a failpoint (`DIE_BEFORE_ACK=1`) that exits the consumer after the commit and before `XACK`. Every test
asserts on the resulting rows, not on log lines.

## What was run

- Bun 1.4.4, `redis:7-alpine`, `postgres:16-alpine`, Flisk from `main` (`411564d1c9c`).
- `flisk up` started the consumer (a local process) with Redis and Postgres as bring-your-own containers; `flisk status` showed all three ready.
- `bun test` passed 5 of 5 against that stack. Against throwaway containers on other ports it passed too.
- Two deliberate breaks, each caught by one test: acknowledging **before** the handler fails the kill test; removing the forward-only `WHERE` fails the reordering test.
- With `flisk up` running, two copies of one event on the live stream gave `applied` then `duplicate` in `flisk logs --service consumer`.

## Limits

- **Redis Streams only.** The pattern is broker-independent, but redelivery here is Redis consumer-group behaviour. Kafka rebalances, SQS visibility timeouts and NATS JetStream redelivery were not run.
- **The kill is a failpoint in the consumer, not `kill -9`.** It proves the commit-then-die window, not every crash point.
- **`flisk restart <resource>` does not work for a local-process service** (it needs Tilt; tracked in [#3876](https://github.com/flisk-sh/flisk/issues/3876)). The test therefore starts and stops its own consumer processes. To restart the one `flisk up` runs, use `flisk down` and `flisk up`.
- **Two consumers with the same name on one group share one backlog.** Give each instance its own `CONSUMER_NAME`, and decide how a dead instance's backlog is claimed (`XAUTOCLAIM`); the example does not.
- **Effects outside your database** (charging a card) are not made atomic by this. Keep a stable downstream idempotency key, as in [Local webhooks](../local-webhooks.md#the-scenario-to-keep-durable-acceptance-lost-acknowledgement-retry).
- **Not in CI.** The example is run by hand; no e2e suite covers it yet.
- Host ports 5432 and 6379 must be free.

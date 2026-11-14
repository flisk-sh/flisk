# LocalStack (S3 and SQS) with Flisk

[LocalStack](https://github.com/localstack/localstack) emulates AWS services on one port, `4566`. This recipe runs it as a
bring-your-own resource, so `flisk up` starts a local S3 and SQS for your services and tests, with no AWS account.

Checked on 2026-11-14 with Flisk 1.4.57, `localstack/localstack:4.9` (reports version 4.9.2) and Docker 29.5.

## Setup

In a Flisk project, create the resource from the image:

```bash
flisk resource localstack --type bring-your-own --image localstack/localstack:4.9 --port 4566 --no-proxy --yes
```

Then edit `services/main/localstack/service.json` (the folder follows your stack name) so it reads:

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "localstack",
  "appType": "bring-your-own",
  "stack": "main",
  "port": 4566,
  "image": "localstack/localstack:4.9",
  "exposeViaProxy": false,
  "extraPorts": [{ "port": 4566 }],
  "healthCheck": {
    "command": ["curl", "-sf", "http://localhost:4566/_localstack/health"],
    "startPeriod": 30
  },
  "env": {
    "SERVICES": "s3,sqs"
  }
}
```

- `extraPorts` publishes `4566` on `127.0.0.1`. With `exposeViaProxy: false` and no `extraPorts`, the container is
  reachable only from other containers in the stack (as `localstack:4566`), not from your shell or a local process.
- `healthCheck.command` runs `curl` inside the container. LocalStack's health route is `/_localstack/health`, which
  `healthCheckPath` cannot hold (see Limits).
- `SERVICES` starts only S3 and SQS; the health route lists every other service as `disabled`.

Start it and check that both services run:

```bash
flisk up main --wait
curl -s localhost:4566/_localstack/health
```

The JSON shows `"s3": "running"` and `"sqs": "running"`.

## Using S3 and SQS

The image ships `awslocal`, the AWS CLI already pointed at LocalStack, so you can try both services without installing
anything on the host:

```bash
C=$(docker ps --format '{{.Names}}' | grep localstack | head -1)
docker exec "$C" awslocal s3 mb s3://uploads
docker exec "$C" sh -c 'echo hi > /tmp/a.txt && awslocal s3 cp /tmp/a.txt s3://uploads/a.txt'
curl -s localhost:4566/uploads/a.txt          # prints: hi
docker exec "$C" awslocal sqs create-queue --queue-name upload-events
docker exec "$C" awslocal sqs send-message \
  --queue-url http://localhost:4566/000000000000/upload-events --message-body uploaded:a.txt
docker exec "$C" awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/upload-events
```

Your own services point an AWS SDK at LocalStack with these variables. LocalStack accepts any credentials; `test` is the
usual placeholder, not a secret:

| Where the service runs | `AWS_ENDPOINT_URL` |
| --- | --- |
| Local process (`command` in `service.json`) | `http://localhost:4566` |
| Container in the same stack | `http://localstack:4566` |

Also set `AWS_REGION=us-east-1`, `AWS_ACCESS_KEY_ID=test` and `AWS_SECRET_ACCESS_KEY=test`, and add `"dependsOn":
["localstack"]` so the service starts after LocalStack is healthy. For S3, use path-style addressing
(`forcePathStyle: true` in the AWS SDK for JavaScript) or the bucket name is sent as a hostname that does not resolve.

## Limits

- `healthCheckPath` and `healthCheck.path` only allow `a-z`, `0-9`, `/` and `-`, so `/_localstack/health` is rejected
  when `flisk up` validates the manifest. `flisk resource --health-path /_localstack/health` writes it without an error,
  and the failure shows up only at `flisk up`. Use the `healthCheck.command` above instead.
- Buckets and queues live in the container and are gone after `flisk down` or a container restart. Create them in a
  setup step of your service or test, or mount a volume and set `PERSISTENCE=1`, which is a LocalStack Pro feature.
- The free image covers S3 and SQS. Some other AWS services need a LocalStack license.

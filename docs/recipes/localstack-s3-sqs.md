# Local-Only AWS Emulation (S3 & SQS) with Flisk

This recipe demonstrates how to run a fully offline AWS-compatible environment using **LocalStack**, **Bun**, and **Hono**, allowing local development and E2E testing without an active AWS account.

## Architecture

* **API (`src/index.ts` & `src/upload.routes.ts`):** Handles file uploads to a local S3 bucket and dispatches a notification event to a local SQS queue.
* **Worker (`src/worker.ts`):** Consumes messages from the local SQS queue asynchronously.
* **LocalStack:** Emulates AWS services (`S3` and `SQS`) locally on port `4566`.

---

## Prerequisites

Ensure LocalStack is running locally and the endpoints point to port `4566`:
```env
AWS_ENDPOINT=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
Running the E2E Test

To validate the complete asynchronous lifecycle (API upload -> SQS queue -> test consumption):

Stop any running worker processes to prevent race conditions during message polling.

Run the integration test suite:

bun test src/upload.test.ts
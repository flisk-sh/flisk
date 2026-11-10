# AWS S3 & SQS Integration (Local Emulators)

This recipe demonstrates how to connect a Flisk stack to local emulators for **Amazon S3** and **Amazon SQS** (using LocalStack) without requiring real cloud credentials or internet connections.

## Architecture Flow

1. **Backend Service**: Accepts a file upload, saves it to LocalStack (S3 emulator), and publishes a notification message to LocalStack SQS.
2. **Worker Service**: Polls SQS for incoming messages, retrieves the target file from S3, and processes it.

## Environment Setup

Configure your local environment variables to point directly to the LocalStack emulator endpoints:

```env
# S3 / LocalStack Settings
AWS_S3_ENDPOINT=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
S3_BUCKET_NAME=test-bucket

# SQS / LocalStack Settings
AWS_SQS_ENDPOINT=http://localhost:4566
SQS_QUEUE_URL=http://localhost:4566/000000000000/my-test-queue

## Resource Initialization

Before running the worker or publishing messages, ensure the SQS queue exists in LocalStack by running:

```powershell
node -e "const {SQSClient,CreateQueueCommand}=require('@aws-sdk/client-sqs');(async()=>{const sqs=new SQSClient({region:'us-east-1',endpoint:'http://localhost:4566',credentials:{accessKeyId:'test',secretAccessKey:'test'}});await sqs.send(new CreateQueueCommand({QueueName:'my-test-queue'}));console.log('Queue my-test-queue successfully created.');})();"

##Running the Consumer
To start polling and processing messages from the SQS queue:

```Bash
node examples/s3-sqs/consumer.cjs

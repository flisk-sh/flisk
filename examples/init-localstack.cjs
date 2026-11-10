const { SQSClient, CreateQueueCommand } = require("@aws-sdk/client-sqs");
const { S3Client, CreateBucketCommand } = require("@aws-sdk/client-s3");

const REGION = "us-east-1";
const ENDPOINT = "http://localhost:4566";

const sqs = new SQSClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" }
});

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: "test", secretAccessKey: "test" }
});

async function main() {
  try {
    console.log("Creando cola SQS...");
    await sqs.send(new CreateQueueCommand({ QueueName: "test-queue" }));
    console.log("Cola 'test-queue' creada con éxito.");

    console.log("Creando bucket S3...");
    await s3.send(new CreateBucketCommand({ Bucket: "test-bucket" }));
    console.log("Bucket 'test-bucket' creado con éxito.");
  } catch (err) {
    console.error("Error al inicializar recursos:", err);
  }
}

main();
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const endpoint = "http://localhost:4566"; // Puerto local de emulación

const s3 = new S3Client({
  region: "us-east-1",
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: "test", secretAccessKey: "test" }
});

const sqs = new SQSClient({
  region: "us-east-1",
  endpoint,
  credentials: { accessKeyId: "test", secretAccessKey: "test" }
});

async function run() {
  // 1. Subir archivo a S3 simulado
  await s3.send(new PutObjectCommand({
    Bucket: "my-test-bucket",
    Key: "hello.txt",
    Body: "Hola desde Flisk y S3 local!"
  }));
  console.log("Archivo subido a S3 con éxito.");

  // 2. Enviar mensaje de notificación por SQS
  await sqs.send(new SendMessageCommand({
    QueueUrl: "http://localhost:4566/000000000000/my-test-queue",
    MessageBody: JSON.stringify({ event: "Archivo subido", key: "hello.txt" })
  }));
  console.log("Mensaje enviado a SQS con éxito.");
}

run().catch(console.error);
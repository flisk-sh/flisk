const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");

const endpoint = "http://localhost:4566";

const sqs = new SQSClient({
  region: "us-east-1",
  endpoint,
  credentials: { accessKeyId: "test", secretAccessKey: "test" }
});

async function poll() {
  console.log("Escuchando mensajes en SQS...");
  while (true) {
    const data = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: "http://localhost:4566/000000000000/my-test-queue",
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5
    }));

    if (data.Messages) {
      for (const msg of data.Messages) {
        console.log("Mensaje recibido:", msg.Body);
        // Borrar mensaje procesado de la cola
        await sqs.send(new DeleteMessageCommand({
          QueueUrl: "http://localhost:4566/000000000000/my-test-queue",
          ReceiptHandle: msg.ReceiptHandle
        }));
      }
    }
  }
}

poll().catch(console.error);
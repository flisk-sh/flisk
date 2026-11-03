// Your API. It needs only Node. `npm run dev` restarts it when you save.
import { createServer } from "node:http";

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  if (request.url === "/api/hello") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Hello from your API" }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

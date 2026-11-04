// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The menu API of the Flisk demo without Docker. Flisk starts it with PORT set from service.json.
import { createServer } from "node:http";

// status is the radar ring the website puts each dish on: chef (Chef's pick), popular, new, soldout.
const menu = [
  { name: "Burrata with tomatoes", course: "Starters", price: 9, status: "chef" },
  { name: "Arancini", course: "Starters", price: 7, status: "popular" },
  { name: "Beef carpaccio", course: "Starters", price: 12, status: "new" },
  { name: "Focaccia", course: "Starters", price: 4.5, status: "popular" },
  { name: "Margherita", course: "Pizza", price: 11.5, status: "chef" },
  { name: "Diavola", course: "Pizza", price: 13, status: "popular" },
  { name: "Quattro formaggi", course: "Pizza", price: 13.5, status: "popular" },
  { name: "Truffle bianca", course: "Pizza", price: 16, status: "new" },
  { name: "Mushroom risotto", course: "Mains", price: 14, status: "chef" },
  { name: "Cacio e pepe", course: "Mains", price: 12.5, status: "popular" },
  { name: "Sea bass", course: "Mains", price: 19, status: "new" },
  { name: "Osso buco", course: "Mains", price: 22, status: "soldout" },
  { name: "Tiramisu", course: "Desserts", price: 7.5, status: "chef" },
  { name: "Panna cotta", course: "Desserts", price: 6.5, status: "popular" },
  { name: "Affogato", course: "Desserts", price: 5, status: "new" },
  { name: "Espresso", course: "Drinks", price: 2.5, status: "popular" },
  { name: "Limonata", course: "Drinks", price: 4, status: "chef" },
  { name: "Negroni", course: "Drinks", price: 10, status: "new" },
  { name: "Chinotto", course: "Drinks", price: 4, status: "soldout" },
];

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  if (request.url === "/api/menu") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ menu, servedBy: "api", pid: process.pid }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

server.listen(Number(process.env.PORT), () => {
  console.log(`menu API listening on http://localhost:${process.env.PORT}`);
});

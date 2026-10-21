import { useEffect, useState } from "react";
import "./style.css";

type Order = { id: number; item: string; workerSeenAt: string | null };
const api = `${window.location.protocol}//api.${window.location.hostname.replace(/^app\./, "")}/api/orders`;

export function App() {
  const [item, setItem] = useState("coffee");
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("Loading orders…");

  async function refresh() {
    try {
      const response = await fetch(api);
      const data = (await response.json()) as { orders: Order[] };
      setOrders(data.orders);
      setMessage("API and database are connected");
    } catch {
      setMessage("Waiting for the orders API");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, []);

  async function createOrder(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item }),
    });
    if (!response.ok) {
      setMessage(`Could not create order (${response.status})`);
      return;
    }
    setMessage("Order saved; waiting for NATS worker observation…");
    await refresh();
  }

  return (
    <main>
      <p className="eyebrow">Flisk · Hono · PostgreSQL · NATS · Vite · Traefik</p>
      <h1>Order desk</h1>
      <p className="status">{message}</p>
      <form onSubmit={createOrder}>
        <label htmlFor="item">What should the worker process?</label>
        <div className="row">
          <input id="item" value={item} onChange={(event) => setItem(event.target.value)} />
          <button type="submit">Create order</button>
        </div>
      </form>
      <h2>Persisted orders</h2>
      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            <span>#{order.id} · {order.item}</span>
            <strong>{order.workerSeenAt ? "Worker observed" : "Queued"}</strong>
          </li>
        ))}
      </ul>
    </main>
  );
}

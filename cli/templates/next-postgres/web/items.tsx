"use client";

import { useCallback, useEffect, useState } from "react";

// Set by flisk up from the backend's route; empty on the host, where the browser calls the same origin.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface Item {
  id: number;
  title: string;
  done: boolean;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(API_URL + path, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} answered ${response.status}`);
  return response;
}

export default function Items() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await (await call("/items")).json());
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  const done = items?.filter((item) => item.done).length ?? 0;

  return (
    <>
      <div className="section label">01 / Items</div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          void run(() => call("/items", { method: "POST", body: JSON.stringify({ title }) }));
          setTitle("");
        }}
      >
        <input
          type="text"
          maxLength={200}
          aria-label="New item"
          placeholder="Add an item"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="add">
          Add →
        </button>
      </form>
      {error && <div className="err">{error}</div>}
      <ul>
        {items?.map((item, index) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <span className="num label">{String(index + 1).padStart(2, "0")}</span>
            <input
              type="checkbox"
              aria-label={`Mark "${item.title}" as done`}
              checked={item.done}
              onChange={() =>
                run(() =>
                  call(`/items/${item.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ done: !item.done }),
                  }),
                )
              }
            />
            <span className="title">{item.title}</span>
            <button
              type="button"
              className="del"
              aria-label={`Delete "${item.title}"`}
              onClick={() => run(() => call(`/items/${item.id}`, { method: "DELETE" }))}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {items?.length === 0 && <div className="empty">No items yet. Add the first one above.</div>}
      <div className="section label">02 / In Postgres</div>
      <div className="stats">
        <div>
          <span className="label">Items</span>
          <strong>{items?.length ?? "…"}</strong>
        </div>
        <div>
          <span className="label">Done</span>
          <strong>{items ? done : "…"}</strong>
        </div>
        <div>
          <span className="label">Open</span>
          <strong>{items ? items.length - done : "…"}</strong>
        </div>
      </div>
    </>
  );
}

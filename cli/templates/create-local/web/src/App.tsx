import { useEffect, useState } from "react";

export function App() {
  const [message, setMessage] = useState("…");

  useEffect(() => {
    fetch("/api/hello")
      .then((response) => response.json())
      .then((data: { message: string }) => setMessage(data.message))
      .catch(() => setMessage("the API is not answering yet"));
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 560,
        margin: "4rem auto",
        padding: "0 1rem",
      }}
    >
      <h1>__NAME__</h1>
      <p>Your app is running. It asked its API and got:</p>
      <p style={{ color: "#16a34a", fontWeight: 600 }}>{message}</p>
      <p>
        Edit <code>src/App.tsx</code> and save: the page updates on its own.
      </p>
    </main>
  );
}

"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <section className="wrap section">
      <div className="glass panel" style={{ maxWidth: 640 }}>
        <h1 className="h3">This page hit an error</h1>
        <p className="muted small" style={{ wordBreak: "break-word" }}>{error.message || "Unknown error"}</p>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={reset}>Try again</button>
          <a className="btn" href="/">Go home</a>
        </div>
      </div>
    </section>
  );
}

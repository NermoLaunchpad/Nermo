"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy CA", className = "btn btn-sm" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  }
  return (
    <button className={className} onClick={copy} aria-live="polite">
      {done ? "Copied ✓" : label}
    </button>
  );
}

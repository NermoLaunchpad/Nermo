import Link from "next/link";
import { METHODS } from "@/lib/methods";
import { MethodIcon } from "@/components/MethodIcon";

export const metadata = { title: "Methods" };

export default function Methods() {
  return (
    <section className="wrap section">
      <div className="eyebrow">Methods</div>
      <h1 className="h2" style={{ marginTop: 10 }}>Different tokens need different launch mechanics.</h1>
      <p className="muted" style={{ maxWidth: 680 }}>Choose the launch method that fits your token. Every Method also supports an optional developer buy in the launch transaction.</p>
      <div className="grid g-2" style={{ marginTop: 28 }}>
        {METHODS.map((m) => (
          <Link key={m.id} href={`/methods/${m.id}`} className="glass panel" style={{ display: "block" }}>
            <div className="row"><span className="orb lg"><MethodIcon id={m.id} size={26} /></span><div><div className="h3">{m.name}</div><div className="muted small">{m.line}</div></div></div>
            <ul className="small muted" style={{ margin: "18px 0 0", paddingLeft: 18 }}>
              {m.mechanics.slice(0, 2).map((x) => <li key={x} style={{ marginBottom: 6 }}>{x}</li>)}
            </ul>
          </Link>
        ))}
      </div>
    </section>
  );
}

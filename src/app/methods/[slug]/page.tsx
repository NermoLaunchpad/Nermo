import Link from "next/link";
import { notFound } from "next/navigation";
import { METHODS, METHOD_BY_ID, type MethodId } from "@/lib/methods";
import { MethodIcon } from "@/components/MethodIcon";
import { MethodTokens } from "./MethodTokens";

export function generateStaticParams() {
  return METHODS.map((m) => ({ slug: m.id }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const m = METHOD_BY_ID[params.slug as MethodId];
  return { title: m ? m.name : "Method" };
}

export default function MethodPage({ params }: { params: { slug: string } }) {
  const m = METHOD_BY_ID[params.slug as MethodId];
  if (!m) notFound();
  return (
    <section className="wrap section">
      <Link href="/methods" className="small muted">← All methods</Link>
      <div className="glass panel" style={{ marginTop: 16, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 22, alignItems: "center" }}>
        <span className="orb lg"><MethodIcon id={m.id} size={28} /></span>
        <div>
          <h1 className="h2">{m.name}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>{m.line}</p>
        </div>
        <Link href={`/launch?method=${m.id}`} className="btn btn-primary">Launch with {m.name} →</Link>
      </div>
      <div className="glass panel" style={{ marginTop: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>How it works</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{m.mechanics.map((x) => <li key={x} style={{ marginBottom: 8 }}>{x}</li>)}</ul>
      </div>
      <h2 className="h3" style={{ margin: "36px 0 16px" }}>{m.name} launches</h2>
      <MethodTokens id={m.id} />
    </section>
  );
}

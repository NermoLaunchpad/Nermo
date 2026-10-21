import { SITE } from "@/lib/site";
import Link from "next/link";
import { PONS } from "@/lib/pons";
import { EXPLORER } from "@/lib/chain";

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <hr className="rule" />
        <div className="row small muted" style={{ paddingTop: 28, flexWrap: "wrap", gap: 18 }}>
          <Link href="/methods">Methods</Link>
          <a href={`${EXPLORER}/address/${PONS.factory}`} target="_blank" rel="noreferrer">Pons V2 factory</a>
          <a href="https://docs.ponsfamily.com/docs/v2" target="_blank" rel="noreferrer">Pons V2 docs</a>
            {SITE.x && <a href={SITE.x} target="_blank" rel="noreferrer">X @NermoLaunchpad</a>}
        </div>
      </div>
    </footer>
  );
}

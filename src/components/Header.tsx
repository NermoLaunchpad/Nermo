"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";
import { PLATFORM, SITE } from "@/lib/site";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/launch", label: "Launch" },
  { href: "/methods", label: "Methods" },
  { href: "/token", label: `$${PLATFORM.symbol}`, exact: true },
  { href: "https://docs.ponsfamily.com/docs/v2", label: "Docs", external: true },
];

export function Header() {
  const path = usePathname();
  const isActive = (h: string, exact?: boolean) => path === h || (!exact && path.startsWith(h + "/"));
  return (
    <header className="header">
      <div className="wrap">
        <div className="glass header-inner">
          <Link href="/" className="brand" aria-label="Nermo home">
            <img src="/brand/nermo-mark.png" alt="" />
            <span>Nermo</span>
          </Link>
          <nav className="nav" aria-label="Main">
            {NAV.map((n) =>
              n.external ? (
                <a key={n.href} href={n.href} target="_blank" rel="noreferrer">{n.label}</a>
              ) : (
                <Link key={n.href} href={n.href} className={isActive(n.href, "exact" in n && n.exact) ? "active" : ""}>{n.label}</Link>
              ),
            )}
          </nav>
          <div className="header-right">
            {SITE.x && (
              <a href={SITE.x} target="_blank" rel="noreferrer noopener" className="icon-btn" aria-label="Nermo on X" title="Nermo on X">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
            )}
            <Link href="/launch" className="btn btn-sm btn-primary" style={{ display: path === "/launch" ? "none" : undefined }}>Launch Token</Link>
            <ConnectButton />
          </div>
        </div>
        <nav className="mobile-nav" aria-label="Main mobile">
          {NAV.filter((n) => !n.external).map((n) => (
            <Link key={n.href} href={n.href} className={isActive(n.href, "exact" in n && n.exact) ? "active" : ""}>{n.label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

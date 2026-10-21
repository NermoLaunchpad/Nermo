import type { MethodId } from "@/lib/methods";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function MethodIcon({ id, size = 22 }: { id: MethodId; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  switch (id) {
    case "zero-tax":
      return <svg {...s}><path {...P} d="M13.2 2.8 5.6 13.1a.6.6 0 0 0 .5 1h5.3l-1 7.1 7.6-10.3a.6.6 0 0 0-.5-1h-5.3l1-7.1Z" /></svg>;
    case "buyback":
      return <svg {...s}><path {...P} d="M12 21.2c3.9 0 6.6-2.6 6.6-6.3 0-3.4-2.2-5.7-3.9-7.6-.3 1.8-1.2 3-2.3 3.5.3-3.1-1-5.9-3.4-7.9.1 3-1.5 4.9-3 6.7-1.2 1.4-2.2 2.9-2.2 5.1 0 3.9 3 6.5 8.2 6.5Z" /><path {...P} d="M12 21.2c-1.9 0-3.1-1.3-3.1-3 0-1.9 1.6-3 2.3-4.6 1.4 1 3.9 2.7 3.9 4.6 0 1.7-1.2 3-3.1 3Z" /></svg>;
    case "auto-dev-burn":
      return <svg {...s}><path {...P} d="M12 3.2c2.8 3 4.5 5.4 4.5 8.2A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.6c0-2 1-3.9 2.7-5.8.1 2 .8 3.3 2 4.1.7-1.7.8-3.7-.2-6.5Z" /><path {...P} d="M7 20h10M9 17.5l-1 2.5M15 17.5l1 2.5" /></svg>;
    case "charity":
      return <svg {...s}><path {...P} d="M12 20.3S3.5 15.3 3.5 9.3A4.6 4.6 0 0 1 8.1 4.7c1.6 0 3 .8 3.9 2.1a4.7 4.7 0 0 1 3.9-2.1 4.6 4.6 0 0 1 4.6 4.6c0 6-8.5 11-8.5 11Z" /></svg>;
    case "creator-tax":
      return <svg {...s}><circle {...P} cx="9.5" cy="8" r="3.3" /><path {...P} d="M3.5 19.5c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4" /><path {...P} d="M16 5a3.2 3.2 0 0 1 0 6.2M18.3 14.4c1.3.8 2.1 2.5 2.4 5.1" /></svg>;
  }
}

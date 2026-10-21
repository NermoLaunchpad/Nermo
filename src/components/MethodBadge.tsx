import { METHOD_BY_ID, type MethodId } from "@/lib/methods";
import { MethodIcon } from "./MethodIcon";

export function MethodBadge({ id, broken }: { id: MethodId; broken?: boolean }) {
  const m = METHOD_BY_ID[id];
  return (
    <span className={`chip${broken ? " warn" : ""}`} title="Method read from the token's on-chain launch terms">
      <MethodIcon id={id} size={14} />
      {m.name}
    </span>
  );
}

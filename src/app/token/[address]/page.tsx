import { Suspense } from "react";
import TokenView from "./TokenView";

export default function TokenPage({ params }: { params: { address: string } }) {
  return (
    <Suspense fallback={<section className="wrap section"><div className="glass panel skeleton" style={{ height: 360 }} /></section>}>
      <TokenView address={params.address} />
    </Suspense>
  );
}

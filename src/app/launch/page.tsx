import { Suspense } from "react";
import Wizard from "./Wizard";

export const metadata = { title: "Launch" };

export default function LaunchPage() {
  return (
    <Suspense fallback={<section className="wrap section"><div className="glass panel skeleton" style={{ height: 420 }} /></section>}>
      <Wizard />
    </Suspense>
  );
}

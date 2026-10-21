import type { Metadata } from "next";
import { PlatformToken } from "./PlatformToken";
import { PLATFORM } from "@/lib/site";

export const metadata: Metadata = {
  title: `$${PLATFORM.symbol}`,
  description: PLATFORM.description,
};

export default function Page() {
  return <PlatformToken />;
}

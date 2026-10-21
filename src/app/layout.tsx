import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "Nermo · Choose how your token launches", template: "%s · Nermo" },
  description: "A multi-method token launchpad on Pons V2, Robinhood Chain. Zero Tax, Buyback & Lock, Charity, Creator Tax and Auto Dev Burn launches in one interface.",
  metadataBase: new URL(SITE.url),
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "Nermo · One Launchpad. Five Methods.",
    description: SITE.description,
    url: SITE.url,
    images: [{ url: "/og.png", width: 1600, height: 900, alt: "Nermo: One Launchpad. Five Methods." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nermo · One Launchpad. Five Methods.",
    description: SITE.description,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" style={{ colorScheme: "dark" }}>
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

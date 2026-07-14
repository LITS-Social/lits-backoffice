import type { Metadata } from "next";
import "./globals.css";

/**
 * The brand faces are self-hosted (public/fonts) and declared as @font-face in
 * globals.css — not loaded through next/font.
 *
 * This is deliberate. next/font's `variable` option writes `--font-sans` onto
 * the <html> element itself, which outranks the `@theme` declaration in the
 * cascade: as long as DM Sans was mounted that way, no amount of brand tokens
 * in globals.css could win. The fonts are ours, they ship from our origin, and
 * @font-face + preload gives the same single round-trip without the override.
 */

export const metadata: Metadata = {
  title: "Painel Operacional — LITS Beta",
  description: "Painel interno de monitoramento operacional do beta LITS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full" suppressHydrationWarning>
      <head>
        {/* Both faces are above the fold on every route — the sidebar lockup is
            Colus and every cell of every table is Nikkei Maru. Preload, or the
            first paint of an ops panel is a flash of Times New Roman. */}
        <link
          rel="preload"
          href="/fonts/PPNikkeiMaru-Variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Colus.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('lits-theme');if(t){document.documentElement.dataset.theme=t;}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.dataset.theme='dark';}})();`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/layout/app-providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SPPG Ops SaaS",
  description: "SaaS operasional dapur SPPG multi-tenant dengan billing dan audit"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  const saved = localStorage.getItem('mbg-theme') || 'system';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = saved === 'system' ? (systemDark ? 'dark' : 'light') : saved;
  document.documentElement.classList.toggle('dark', mode === 'dark');
})();
`
          }}
        />
      </head>
      <body className={inter.className}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

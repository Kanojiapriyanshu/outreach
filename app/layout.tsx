import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Fidem Growth Outreach",
  description: "Brand & Creator outreach follow-up automation",
};

// Runs before paint so the page never flashes the wrong theme on load. Reads the saved
// preference (set by ThemeToggle) and stamps it on <html> as data-theme; with nothing saved,
// globals.css already falls back to the OS's prefers-color-scheme on its own.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-[var(--bg)] text-[var(--ink)] font-sans">{children}</body>
    </html>
  );
}

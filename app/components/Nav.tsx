"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, SendHorizontal, FileText, BarChart2, Activity, Settings, LogOut } from "lucide-react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/track", label: "New Outreach", icon: SendHorizontal },
  { href: "/templates", label: "Email Templates", icon: FileText },
  { href: "/analytics", label: "Results", icon: BarChart2 },
  { href: "/activity", label: "History", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-[var(--border)]">
        <Logo size={26} />
        <span className="font-semibold text-[15px] tracking-tight text-[var(--ink)]">Fidem Growth</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname?.startsWith(link.href + "/");
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-[var(--brand-teal-light)] text-[var(--brand-teal-dark)]"
                  : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon size={17} strokeWidth={2} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-[var(--border)] space-y-0.5">
        <ThemeToggle />
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] transition-colors"
        >
          <LogOut size={17} strokeWidth={2} />
          Log Out
        </button>
      </div>
    </aside>
  );
}

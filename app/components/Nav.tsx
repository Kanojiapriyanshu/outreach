"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  SendHorizontal,
  Clock,
  Inbox,
  FileEdit,
  Trash2,
  FileText,
  BarChart2,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import NotificationsBell from "./NotificationsBell";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/track", label: "New Outreach", icon: SendHorizontal },
  { href: "/sent", label: "Sent", icon: Inbox },
  { href: "/scheduled", label: "Scheduled", icon: Clock },
  { href: "/drafts", label: "Drafts", icon: FileEdit },
  { href: "/templates", label: "Email Templates", icon: FileText },
  { href: "/analytics", label: "Results", icon: BarChart2 },
  { href: "/activity", label: "History", icon: Activity },
  { href: "/trash", label: "Trash", icon: Trash2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname?.startsWith(link.href + "/");
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-[14px] md:text-[13.5px] font-medium transition-colors ${
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
  );
}

export default function Nav() {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const footer = (
    <div className="px-3 py-3 border-t border-[var(--border)] space-y-0.5">
      <ThemeToggle />
      <button
        onClick={logout}
        className="w-full flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-[14px] md:text-[13.5px] font-medium text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] transition-colors"
      >
        <LogOut size={17} strokeWidth={2} />
        Log Out
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — unchanged, always visible at md and up */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex-col h-screen sticky top-0">
        <div className="flex items-center justify-between gap-2 px-5 h-16 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 min-w-0">
            <Logo size={26} />
            <span className="font-semibold text-[15px] tracking-tight text-[var(--ink)] truncate">Fidem Growth</span>
          </div>
          <NotificationsBell />
        </div>
        <NavLinks />
        {footer}
      </aside>

      {/* Mobile top bar + slide-in drawer — md:hidden */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-2 px-4 h-14 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-semibold text-[14px] tracking-tight text-[var(--ink)]">Fidem Growth</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] h-full bg-[var(--surface)] flex flex-col shadow-xl">
            <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Logo size={22} />
                <span className="font-semibold text-[14px] tracking-tight text-[var(--ink)]">Fidem Growth</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
              >
                <X size={20} />
              </button>
            </div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}

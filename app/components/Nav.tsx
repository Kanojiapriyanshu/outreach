"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  SendHorizontal,
  Clock,
  Inbox,
  Send,
  Users,
  LineChart,
  FileEdit,
  Trash2,
  FileText,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import NotificationsBell from "./NotificationsBell";
import { useNotifications } from "./useNotifications";

// Grouped by what someone is actually doing rather than one flat list of eleven things: mail is
// mail, outreach is the CRM around it. Results used to be its own page and now lives on the
// dashboard, which is where someone already is when they ask how outreach is going.
const SECTIONS: { heading: string | null; links: { href: string; label: string; icon: typeof Inbox }[] }[] = [
  {
    heading: null,
    links: [
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/sent", label: "Sent", icon: Send },
      { href: "/drafts", label: "Drafts", icon: FileEdit },
      { href: "/scheduled", label: "Scheduled", icon: Clock },
      { href: "/trash", label: "Trash", icon: Trash2 },
    ],
  },
  {
    heading: "Outreach",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pipeline", label: "Pipeline", icon: Users },
      { href: "/track", label: "New Outreach", icon: SendHorizontal },
      { href: "/insights", label: "Insight OS", icon: LineChart },
      { href: "/templates", label: "Templates", icon: FileText },
      { href: "/activity", label: "History", icon: Activity },
    ],
  },
  {
    heading: null,
    links: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function NavLinks({ onNavigate, unreadCount }: { onNavigate?: () => void; unreadCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 px-3 py-3 overflow-y-auto">
      {SECTIONS.map((section, i) => (
        <div key={section.heading ?? `section-${i}`} className={i > 0 ? "mt-4" : ""}>
          {section.heading && (
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-2)]">
              {section.heading}
            </div>
          )}
          <div className="space-y-0.5">
            {section.links.map((link) => {
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
                  <span className="flex-1">{link.label}</span>
                  {link.href === "/inbox" && unreadCount > 0 && (
                    <span className="text-[11px] font-bold" style={{ color: "var(--brand-teal-dark)" }}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function Nav() {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { threads, alerts, unreadCount } = useNotifications();

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
          {/* The sidebar itself is only 240px wide, narrower than the dropdown panel — right-
              aligning it to the bell (the default, correct for the mobile top bar below) would
              push it off-screen to the left, so here it opens left-aligned instead, extending
              rightward into the main content area where there's actually room. */}
          <NotificationsBell align="left" threads={threads} alerts={alerts} unreadCount={unreadCount} />
        </div>
        <NavLinks unreadCount={unreadCount} />
        {footer}
      </aside>

      {/* Mobile top bar + slide-in drawer — md:hidden */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-2 px-4 h-14 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-semibold text-[14px] tracking-tight text-[var(--ink)]">Fidem Growth</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationsBell threads={threads} alerts={alerts} unreadCount={unreadCount} />
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
            <NavLinks unreadCount={unreadCount} onNavigate={() => setDrawerOpen(false)} />
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}

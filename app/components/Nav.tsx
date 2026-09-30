"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Clock,
  Inbox,
  Send,
  LineChart,
  FileEdit,
  Trash2,
  FileText,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  Compass,
  Megaphone,
  FileSignature,
  Building2,
  Link2,
  Users,
  Sparkles,
  Plus,
  Search,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import NotificationsBell from "./NotificationsBell";
import { useNotifications } from "./useNotifications";
import { useCatchUpSync } from "./useCatchUpSync";

type NavLink = { href: string; label: string; icon: typeof Inbox; badge?: "unread" | "brands" | "influencers" };

// Organised by who the work is with. Brands and Influencers are separate workspaces with their own
// outreach tracker, because the team works them differently: brands are asked about a creator list,
// creators are asked for a rate. Mail and tools sit below, used from both.
const SECTIONS: { heading: string | null; accent?: string; links: NavLink[] }[] = [
  {
    heading: null,
    links: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox, badge: "unread" },
    ],
  },
  {
    heading: "Brands",
    accent: "#a5b4fc",
    links: [
      { href: "/brands", label: "Brand outreach", icon: Building2, badge: "brands" },
      { href: "/brands/pitch-sheets", label: "Pitch sheets", icon: Link2 },
      { href: "/contracts", label: "Contracts", icon: FileSignature },
    ],
  },
  {
    heading: "Influencers",
    accent: "#7ee8d8",
    links: [
      { href: "/influencers", label: "Influencer outreach", icon: Megaphone, badge: "influencers" },
      { href: "/influencers/creators", label: "Creators", icon: Users },
      { href: "/influencers/roster", label: "Public roster", icon: Sparkles },
      { href: "/discovery", label: "Discovery", icon: Compass },
    ],
  },
  {
    heading: "Mail",
    links: [
      { href: "/sent", label: "Sent", icon: Send },
      { href: "/drafts", label: "Drafts", icon: FileEdit },
      { href: "/scheduled", label: "Scheduled", icon: Clock },
      { href: "/trash", label: "Trash", icon: Trash2 },
    ],
  },
  {
    heading: "Tools",
    links: [
      { href: "/insights", label: "Insight OS", icon: LineChart },
      { href: "/templates", label: "Templates", icon: FileText },
      { href: "/activity", label: "History", icon: Activity },
    ],
  },
];

const ALL_HREFS = SECTIONS.flatMap((s) => s.links.map((l) => l.href)).concat("/settings");

/** The most specific nav entry for the current page — /brands/pitch-sheets lights up Pitch sheets,
 * not Brand outreach as well. */
function activeHref(pathname: string | null): string | null {
  if (!pathname) return null;
  // /dashboard/<id> is a single outreach thread, not part of Home.
  const matches = ALL_HREFS.filter((href) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/")));
  if (matches.length === 0) {
    // A single outreach thread belongs to whichever workspace it came from; the page itself says
    // which, so nothing in the nav is claimed for it.
    return null;
  }
  return matches.sort((a, b) => b.length - a.length)[0];
}

function NavLinks({ onNavigate, counts }: { onNavigate?: () => void; counts: Record<"unread" | "brands" | "influencers", number> }) {
  const pathname = usePathname();
  const active = activeHref(pathname);
  return (
    <nav className="flex-1 px-3 py-4 overflow-y-auto scroll-slim">
      {SECTIONS.map((section, i) => (
        <div key={section.heading ?? `section-${i}`} className={i > 0 ? "mt-5" : ""}>
          {section.heading && (
            <div className="flex items-center gap-2 px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--sidebar-muted)" }}>
              {section.accent && <span className="w-1.5 h-1.5 rounded-full" style={{ background: section.accent }} />}
              {section.heading}
            </div>
          )}
          <div className="space-y-0.5">
            {section.links.map((link) => {
              const isActive = active === link.href;
              const Icon = link.icon;
              const count = link.badge ? counts[link.badge] : 0;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className="group flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors"
                  style={{
                    background: isActive ? "var(--sidebar-active)" : undefined,
                    color: isActive ? "var(--sidebar-active-ink)" : "var(--sidebar-ink)",
                  }}
                >
                  <Icon size={16} strokeWidth={2} style={{ opacity: isActive ? 1 : 0.7 }} />
                  <span className="flex-1 truncate group-hover:opacity-100" style={{ opacity: isActive ? 1 : 0.85 }}>
                    {link.label}
                  </span>
                  {count > 0 && (
                    <span
                      className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center tabular"
                      style={
                        link.badge === "unread"
                          ? { background: "rgba(255,255,255,0.1)", color: "var(--sidebar-ink)" }
                          : { background: "#7ee8d8", color: "#0b1320" }
                      }
                      title={link.badge === "unread" ? `${count} unread` : `${count} waiting on your reply`}
                    >
                      {count > 99 ? "99+" : count}
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

function SidebarBrand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-5 h-16 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
      <Logo size={26} />
      <div className="leading-tight min-w-0">
        <div className="font-semibold text-[14.5px] tracking-tight truncate" style={{ color: "#fff" }}>
          Fidem Growth
        </div>
        <div className="text-[11px] truncate" style={{ color: "var(--sidebar-muted)" }}>
          Outreach OS
        </div>
      </div>
    </Link>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const settingsActive = pathname === "/settings" || pathname?.startsWith("/settings/");
  return (
    <div className="px-3 py-3 border-t space-y-0.5" style={{ borderColor: "var(--sidebar-border)" }}>
      <Link
        href="/settings"
        onClick={onNavigate}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors"
        style={{ background: settingsActive ? "var(--sidebar-active)" : undefined, color: settingsActive ? "var(--sidebar-active-ink)" : "var(--sidebar-ink)" }}
      >
        <Settings size={16} strokeWidth={2} style={{ opacity: 0.7 }} />
        Settings
      </Link>
      <button
        onClick={logout}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors hover:bg-[var(--sidebar-hover)]"
        style={{ color: "var(--sidebar-muted)" }}
      >
        <LogOut size={16} strokeWidth={2} />
        Log out
      </button>
    </div>
  );
}

/** "New outreach" with a choice of which side — the two flows ask for different things. */
function NewOutreachMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm" aria-expanded={open}>
        <Plus size={15} /> <span className="hidden sm:inline">New outreach</span> <ChevronDown size={14} className="opacity-80" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 card p-1.5 z-50" style={{ boxShadow: "var(--shadow-pop)" }}>
          <MenuItem href="/track?outreachType=BRAND" icon={<Building2 size={15} />} title="Pitch a brand" body="Offer creators to a brand or agency" onPick={() => setOpen(false)} accent="var(--brands-accent)" />
          <MenuItem href="/track?outreachType=CREATOR" icon={<Megaphone size={15} />} title="Pitch a creator" body="Ask an influencer about a paid collab" onPick={() => setOpen(false)} accent="var(--influencers-accent)" />
        </div>
      )}
    </div>
  );
}

function MenuItem({ href, icon, title, body, onPick, accent }: { href: string; icon: React.ReactNode; title: string; body: string; onPick: () => void; accent: string }) {
  return (
    <Link href={href} onClick={onPick} className="flex items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-[var(--surface-2)] transition-colors">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "var(--surface-2)", color: accent }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--ink)]">{title}</span>
        <span className="block text-xs text-[var(--muted)]">{body}</span>
      </span>
    </Link>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative flex-1 max-w-md"
    >
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search brands, creators, emails…"
        aria-label="Search brands and creators"
        className="input pl-9 py-1.5 text-sm"
        style={{ minHeight: 36, background: "var(--surface-2)" }}
      />
    </form>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { threads, alerts, unreadCount, waiting, reload } = useNotifications();
  const { syncing } = useCatchUpSync(reload);
  const counts = { unread: unreadCount, brands: waiting.brands, influencers: waiting.influencers };

  return (
    <div className="min-h-full flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col h-screen sticky top-0" style={{ background: "var(--sidebar-bg)" }}>
        <SidebarBrand />
        <NavLinks counts={counts} />
        <SidebarFooter />
      </aside>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] h-full flex flex-col shadow-xl" style={{ background: "var(--sidebar-bg)" }}>
            <div className="flex items-center justify-between pr-3">
              <SidebarBrand />
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="p-2 rounded-lg" style={{ color: "var(--sidebar-ink)" }}>
                <X size={20} />
              </button>
            </div>
            <NavLinks counts={counts} onNavigate={() => setDrawerOpen(false)} />
            <SidebarFooter onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 px-4 md:px-8 h-14 md:h-16 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="md:hidden p-2 -ml-2 rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)]">
            <Menu size={20} />
          </button>
          <Link href="/dashboard" className="md:hidden">
            <Logo size={22} />
          </Link>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            {syncing && (
              <span className="hidden sm:inline-flex items-center gap-1.5 mr-2 text-xs text-[var(--muted)]" role="status">
                <RefreshCw size={13} className="animate-spin" /> Syncing Gmail…
              </span>
            )}
            <ThemeToggle compact />
            <NotificationsBell threads={threads} alerts={alerts} unreadCount={unreadCount} />
            <div className="ml-2">
              <NewOutreachMenu />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * The app's page furniture — header, KPI tiles, panels, view tabs, empty states, pager. Server-safe
 * (no hooks), so any page can use them. Keeping these in one place is what makes every screen read
 * as the same product: the same title block, the same numbers row, the same table frame.
 */
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

export type Workspace = "brands" | "influencers" | "workspace";

const WORKSPACE_LABEL: Record<Workspace, string> = {
  brands: "Brands",
  influencers: "Influencers",
  workspace: "Workspace",
};

const WORKSPACE_ACCENT: Record<Workspace, { fg: string; bg: string }> = {
  brands: { fg: "var(--brands-accent)", bg: "var(--brands-accent-light)" },
  influencers: { fg: "var(--influencers-accent)", bg: "var(--influencers-accent-light)" },
  workspace: { fg: "var(--muted)", bg: "var(--neutral-bg)" },
};

export function PageHeader({
  workspace,
  section,
  title,
  description,
  actions,
}: {
  workspace?: Workspace;
  /** Shown after the workspace in the breadcrumb, e.g. "Pitch sheets". */
  section?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const accent = workspace ? WORKSPACE_ACCENT[workspace] : null;
  return (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div className="min-w-0">
        {workspace && (
          <div className="flex items-center gap-1.5 text-xs font-medium mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5" style={{ color: accent!.fg, background: accent!.bg }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent!.fg }} />
              {WORKSPACE_LABEL[workspace]}
            </span>
            {section && (
              <>
                <span className="text-[var(--muted-2)]">/</span>
                <span className="text-[var(--muted)]">{section}</span>
              </>
            )}
          </div>
        )}
        <h1 className="text-[24px] leading-8 font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
        {description && <p className="text-sm text-[var(--muted)] mt-1 max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** Top-level tabs inside a workspace (Outreach · Pitch sheets · Contracts). Underlined, like a
 * product's sub-navigation — distinct from the pill filters that slice one list. */
export function WorkspaceTabs({ tabs, active }: { tabs: { key: string; href: string; label: string; count?: number }[]; active: string }) {
  return (
    <div className="border-b border-[var(--border)] -mt-1">
      <nav className="flex gap-6 overflow-x-auto overflow-y-hidden scroll-slim" aria-label="Sections">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className="relative -mb-px inline-flex items-center gap-2 whitespace-nowrap py-2.5 text-sm font-medium transition-colors"
              style={{
                color: isActive ? "var(--ink)" : "var(--muted)",
                borderBottom: `2px solid ${isActive ? "var(--brand-teal)" : "transparent"}`,
              }}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="rounded-full px-1.5 text-[11px] font-semibold leading-[18px]" style={{ background: "var(--neutral-bg)", color: "var(--neutral-fg)" }}>
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function KpiGrid({ children, columns = 4 }: { children: React.ReactNode; columns?: 3 | 4 | 5 | 6 }) {
  const cols = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[columns];
  return <div className={`grid grid-cols-2 ${cols} gap-3`}>{children}</div>;
}

export function Kpi({
  label,
  value,
  hint,
  href,
  tone = "default",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "default" | "accent" | "success" | "danger";
  icon?: React.ReactNode;
}) {
  const color = { default: "var(--ink)", accent: "var(--brand-teal-dark)", success: "var(--success-fg)", danger: "var(--danger-fg)" }[tone];
  const inner = (
    <div
      className="card h-full px-4 py-3.5 transition-colors"
      style={tone === "accent" ? { borderColor: "var(--brand-teal)", boxShadow: "0 0 0 1px var(--brand-teal-light)" } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[var(--muted)] truncate">{label}</span>
        {icon && <span className="text-[var(--muted-2)] shrink-0">{icon}</span>}
      </div>
      <div className="mt-2 text-[26px] font-semibold tracking-tight leading-none tabular" style={{ color }}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[11.5px] text-[var(--muted-2)] truncate">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-[var(--radius-card)] hover:-translate-y-px transition-transform">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Panel({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
        <h2 className="flex items-center gap-2 font-semibold text-[13.5px] text-[var(--ink)]">
          {icon && <span className="text-[var(--muted-2)]">{icon}</span>}
          {title}
        </h2>
        {action && (
          <Link href={action.href} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--brand-teal-dark)" }}>
            {action.label} <ArrowRight size={12} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Pill filters that slice one list (All · Needs your reply · …), each with its count. */
export function ViewPills({ items, active }: { items: { key: string; label: string; count: number; href: string }[]; active: string }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {items.map((v) => {
        const isActive = v.key === active;
        return (
          <Link
            key={v.key}
            href={v.href}
            aria-current={isActive ? "true" : undefined}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium rounded-lg border transition-colors"
            style={
              isActive
                ? { background: "var(--ink)", color: "var(--ink-inverse)", borderColor: "var(--ink)" }
                : { background: "var(--surface)", color: "var(--muted)", borderColor: "var(--border)" }
            }
          >
            {v.label}
            <span className="tabular" style={{ opacity: isActive ? 0.75 : 0.9, color: isActive ? undefined : "var(--muted-2)" }}>
              {v.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--neutral-bg)", color: "var(--muted)" }}>
          {icon}
        </div>
      )}
      <div className="text-sm font-semibold text-[var(--ink)]">{title}</div>
      {body && <div className="mt-1 text-sm text-[var(--muted)] max-w-md mx-auto">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** "51–100 of 342" with previous/next — the same pager under every long list. */
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  if (total <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = end < total;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
      <span className="text-[var(--muted)] tabular">
        {start}–{end} of {total}
      </span>
      <div className="flex gap-2">
        <Link
          href={href(page - 1)}
          aria-disabled={!hasPrev}
          className={`btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs ${!hasPrev ? "pointer-events-none opacity-40" : ""}`}
        >
          <ChevronLeft size={14} /> Previous
        </Link>
        <Link
          href={href(page + 1)}
          aria-disabled={!hasNext}
          className={`btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs ${!hasNext ? "pointer-events-none opacity-40" : ""}`}
        >
          Next <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar
    <img src={src} alt="" className="rounded-full shrink-0 object-cover" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <div
      className="rounded-full shrink-0 flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: "var(--neutral-bg)", color: "var(--neutral-fg)" }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Email 1 plus follow-ups as dots — filled once sent. */
export function SendDots({ sent, total = 4, labels }: { sent: { sentAt: Date }[]; total?: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${sent.length} automated emails sent`}>
      {Array.from({ length: total }, (_, i) => {
        const s = sent[i];
        return (
          <span
            key={i}
            title={s ? `${labels[i]} — sent ${s.sentAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : `${labels[i]} — not sent`}
            className="w-2 h-2 rounded-full"
            style={{
              background: s ? "var(--brand-teal)" : "transparent",
              border: `1.5px solid ${s ? "var(--brand-teal)" : "var(--border-strong)"}`,
            }}
          />
        );
      })}
    </div>
  );
}

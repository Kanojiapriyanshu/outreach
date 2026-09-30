/**
 * The shared look of every page a brand opens without logging in — the pitch sheet and the public
 * creator roster. Always light, always the same header and footer, so a brand who has seen one
 * Fidem link recognises the next.
 */
import Logo from "@/app/components/Logo";

export const BRAND_TEAL = "#157a8c";
export const BRAND_TEAL_DARK = "#0e5c6b";

export function compactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** "US" → "United States". Anything that isn't a 2-letter code is shown as written. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (!/^[A-Za-z]{2}$/.test(trimmed)) return trimmed || null;
  try {
    return regionNames?.of(trimmed.toUpperCase()) ?? trimmed.toUpperCase();
  } catch {
    return trimmed.toUpperCase();
  }
}

export function BrandTopBar({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <Logo size={30} />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-white">Fidem Growth</div>
          <div className="text-[11px] text-white/60">Creator partnerships</div>
        </div>
      </div>
      {right}
    </div>
  );
}

/** The dark band at the top of every brand-facing page. */
export function BrandHero({ children }: { children: React.ReactNode }) {
  return (
    <header className="relative overflow-hidden bg-[#0b1320] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 80% at 85% 0%, rgba(42,167,184,0.35), transparent 60%), radial-gradient(40% 60% at 0% 100%, rgba(169,198,43,0.18), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-6 sm:px-8 sm:pb-16">{children}</div>
    </header>
  );
}

export function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[28px] font-semibold leading-none tracking-tight sm:text-[34px]">{value}</div>
      <div className="mt-2 text-[12px] font-medium uppercase tracking-[0.12em] text-white/55">{label}</div>
    </div>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND_TEAL }}>
          {eyebrow}
        </div>
        <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function CreatorAvatar({ name, src, size = 56 }: { name: string; src: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-500 font-semibold text-white ring-2 ring-white shadow-sm"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
      <div className="text-[15px] font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

export function BrandFooter({ note, contactEmail }: { note?: string; contactEmail: string | null }) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Logo size={22} />
          <span className="font-semibold text-slate-800">Fidem Growth</span>
          <span className="hidden sm:inline">· Influencer marketing & creator partnerships</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href="https://fidemgrowth.com" className="hover:text-slate-900">
            fidemgrowth.com
          </a>
          {contactEmail && (
            <a href={`mailto:${contactEmail}`} className="hover:text-slate-900">
              {contactEmail}
            </a>
          )}
          {note && <span className="text-slate-400">{note}</span>}
        </div>
      </div>
    </footer>
  );
}

export function Unavailable({ title, message, contactEmail }: { title: string; message: string; contactEmail: string | null }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-center">
          <Logo size={36} />
        </div>
        <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        {contactEmail && (
          <a
            href={`mailto:${contactEmail}`}
            className="mt-6 inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-white"
            style={{ background: BRAND_TEAL }}
          >
            Contact Fidem Growth
          </a>
        )}
      </div>
    </main>
  );
}

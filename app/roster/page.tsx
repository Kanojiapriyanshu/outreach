import type { Metadata } from "next";
import { headers } from "next/headers";
import { ArrowUpRight } from "lucide-react";
import Logo from "@/app/components/Logo";
import { appBaseUrl } from "@/lib/pitchSheetServer";
import { loadPublicRoster } from "@/lib/publicRoster";
import { publicContactEmail } from "@/lib/publicContact";
import { compactNumber } from "@/app/components/public/BrandKit";
import RosterExplorer from "./RosterExplorer";
import ShareButton from "./ShareButton";
import PlatformIcon from "./PlatformIcon";

// Creators join (and stats refresh) as outreach happens — always read it fresh.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creator Roster — Fidem Growth",
  description: "YouTube creators Fidem Growth partners with — vetted for audience quality, engagement and brand fit.",
  // Shared by link with brands; not meant to be found through search.
  robots: { index: false, follow: false },
  openGraph: {
    title: "The Fidem Growth creator roster",
    description: "YouTube creators we partner with — vetted for audience quality, engagement and brand fit.",
    type: "website",
  },
};

/**
 * The public creator roster — one evergreen link the team shares with every brand to show who
 * Fidem works with, laid out like a talent agency's roster page: who we are, the numbers, the
 * talent. Creators appear once they're interested or have given a rate (and the team hasn't hidden
 * them). Prices are never shown here: a brand gets rates on its own pitch sheet.
 */
export default async function PublicRosterPage() {
  const h = await headers();
  const base = appBaseUrl(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`);
  const [roster, contactEmail] = await Promise.all([loadPublicRoster(base), publicContactEmail()]);
  const { stats } = roster;
  const mailto = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent("Creator shortlist request")}&body=${encodeURIComponent(
        "Hi Fidem Growth team,\n\nWe'd like a creator shortlist.\n\nBrand / product:\nTarget audience & markets:\nBudget:\nTimeline:\nCreators we liked on your roster:\n\nThanks!"
      )}`
    : null;

  const tiles: { value: string; label: string; icon?: string }[] = [
    { value: compactNumber(stats.reach), label: "Total YouTube reach", icon: "youtube" },
    { value: String(stats.creators), label: "Creators" },
    { value: compactNumber(stats.viewsPerVideo), label: "Views per video" },
    { value: stats.avgEngagement !== null ? `${stats.avgEngagement.toFixed(1)}%` : "—", label: "Avg. engagement" },
    ...(stats.onInstagram > 0 ? [{ value: String(stats.onInstagram), label: "Also on Instagram", icon: "instagram" }] : []),
    ...(stats.onTiktok > 0 ? [{ value: String(stats.onTiktok), label: "Also on TikTok", icon: "tiktok" }] : []),
    ...(stats.countries > 1 ? [{ value: String(stats.countries), label: "Countries" }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#0a0b12] text-white">
      <div className="sticky top-0 z-30 border-b border-white/5 bg-[#0a0b12]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="text-sm font-semibold">Fidem Growth</span>
          </div>
          <div className="flex items-center gap-2">
            {mailto && (
              <a href={mailto} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#2aa7b8] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#2595a5]">
                <span className="sm:hidden">Contact us</span>
                <span className="hidden sm:inline">Request a shortlist</span>
              </a>
            )}
            <ShareButton />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <section className="flex flex-col items-start gap-6 pt-12 sm:flex-row sm:items-center">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_0_0_6px_rgba(255,255,255,0.04)]">
            <Logo size={64} />
          </div>
          <div className="max-w-2xl">
            <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Fidem Growth</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-white/60">
              Influencer marketing and creator partnerships. We connect brands with YouTube creators whose audiences actually watch — vetted for
              engagement and brand fit, and managed end to end, from brief to posting.
            </p>
            {mailto && (
              <a href={mailto} className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#2aa7b8] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2595a5]">
                Request a shortlist <ArrowUpRight size={15} />
              </a>
            )}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-lg font-semibold">Roster stats</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-white/5 bg-white/[0.04] px-4 py-3 sm:min-w-[132px]">
                <div className="flex items-center gap-1.5 text-[17px] font-semibold tabular-nums">
                  {t.icon && (
                    <span className="text-white/80">
                      <PlatformIcon platform={t.icon} size={14} />
                    </span>
                  )}
                  {t.value}
                </div>
                <div className="mt-0.5 text-xs text-white/45">{t.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <RosterExplorer creators={roster.creators} niches={roster.niches} />
        </section>

        <section className="mt-20 overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-[#0f2a33] to-[#10131d]">
          <div className="grid gap-8 p-8 sm:p-10 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7ee8d8]">Work with us</div>
              <h2 className="mt-2 text-[24px] font-semibold tracking-tight">Get a shortlist built for your brand</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                Tell us your product, audience, budget and timeline. We&apos;ll send a tailored pitch sheet — each creator&apos;s channel, media kit and
                rate — confirm availability, and run the campaign through to posting.
              </p>
            </div>
            {mailto && (
              <div className="flex flex-col items-start gap-2 md:items-end">
                <a href={mailto} className="inline-flex items-center gap-2 rounded-full bg-[#7ee8d8] px-6 py-3 text-sm font-semibold text-[#0a0b12] transition hover:opacity-90">
                  Request a shortlist <ArrowUpRight size={16} />
                </a>
                <span className="text-xs text-white/40">{contactEmail}</span>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-white/40 sm:px-8">
          <span>© {new Date().getFullYear()} Fidem Growth · Creator partnerships</span>
          <a href="https://fidemgrowth.com" className="hover:text-white/70">
            fidemgrowth.com
          </a>
        </div>
      </footer>
    </div>
  );
}

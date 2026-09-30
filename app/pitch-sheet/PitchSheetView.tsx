import { headers } from "next/headers";
import { ArrowUpRight, PlayCircle, FileText, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { daysLeft } from "@/lib/pitchSheet";
import { appBaseUrl, loadPublicPitchSheet, PitchSheetUnavailable, type PublicPitchSheet } from "@/lib/pitchSheetServer";
import { publicContactEmail } from "@/lib/publicContact";
import { isTeamViewer } from "@/lib/teamViewer";
import {
  BRAND_TEAL,
  BRAND_TEAL_DARK,
  BrandFooter,
  BrandHero,
  BrandTopBar,
  CreatorAvatar,
  HeroStat,
  Metric,
  SectionTitle,
  Unavailable,
  compactNumber,
  countryName,
} from "@/app/components/public/BrandKit";

const DEFAULT_INTRO = [
  "Selected for strong audience engagement and reach relative to rate.",
  "Every creator here has already confirmed they're open to a paid collaboration.",
  "Open a media kit to review audience, recent performance and past brand work before deciding.",
];

/**
 * The no-login creator shortlist a brand opens from a pitch-sheet link — served at both the short
 * /p/<name>-<code> URL and the original /pitch-sheet/<token> one, so links already sent keep working.
 */
export default async function PitchSheetView({ token }: { token: string }) {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const contactEmail = await publicContactEmail();

  let sheet: PublicPitchSheet;
  try {
    sheet = await loadPublicPitchSheet(token, appBaseUrl(origin));
  } catch (err) {
    if (err instanceof PitchSheetUnavailable) return <Unavailable title="Shortlist unavailable" message={err.message} contactEmail={contactEmail} />;
    throw err;
  }
  if (!(await isTeamViewer())) {
    await prisma.pitchSheet.update({ where: { id: sheet.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => undefined);
  }

  const left = daysLeft(sheet.expiresAt);
  const intro = sheet.intro?.split("\n").map((l) => l.trim()).filter(Boolean) ?? DEFAULT_INTRO;
  const reach = sheet.creators.reduce((sum, c) => sum + (c.subscriberCount ?? 0), 0);
  const views = sheet.creators.reduce((sum, c) => sum + (c.averageViews ?? 0), 0);
  const engagements = sheet.creators.map((c) => c.engagementRate).filter((e): e is number => e !== null);
  const avgEngagement = engagements.length ? engagements.reduce((a, b) => a + b, 0) / engagements.length : null;
  const updated = new Date(sheet.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const mailto = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(`${sheet.brandName} — creator shortlist`)}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <BrandHero>
        <BrandTopBar
          right={
            left !== null ? (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75">
                Link open for {left} more day{left === 1 ? "" : "s"}
              </span>
            ) : null
          }
        />
        <div className="mt-12 max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7ee8d8]">Creator shortlist</div>
          <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">{sheet.title}</h1>
          <p className="mt-3 text-[15px] text-white/70">
            Prepared for <span className="font-medium text-white">{sheet.brandName}</span> · Updated {updated}
          </p>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <HeroStat value={String(sheet.creators.length)} label={sheet.creators.length === 1 ? "Creator" : "Creators"} />
          <HeroStat value={compactNumber(reach)} label="Combined subscribers" />
          <HeroStat value={compactNumber(views)} label="Views per video, combined" />
          <HeroStat value={avgEngagement !== null ? `${avgEngagement.toFixed(1)}%` : "—"} label="Avg. engagement" />
        </div>
      </BrandHero>

      <main className="mx-auto max-w-6xl space-y-14 px-5 py-12 sm:px-8">
        <section>
          <SectionTitle eyebrow="Approach" title="How this shortlist was built" />
          <div className="grid gap-3 sm:grid-cols-3">
            {intro.map((line, i) => (
              <div key={line} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: BRAND_TEAL }}>
                  {i + 1}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{line}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="Recommended" title={`${sheet.creators.length} creator${sheet.creators.length === 1 ? "" : "s"} for ${sheet.brandName}`} />
          <div className="grid gap-4 md:grid-cols-2">
            {sheet.creators.map((c) => (
              <CreatorCard key={c.id} c={c} />
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl bg-[#0b1320] text-white">
          <div className="grid gap-8 p-7 sm:p-10 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7ee8d8]">Next steps</div>
              <h2 className="mt-2 text-[24px] font-semibold tracking-tight">Pick your creators — we handle the rest</h2>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-white/75">
                <li>• Tell us which creators you&apos;d like to move forward with, and your total budget.</li>
                <li>• We confirm availability, lock rates and manage briefs, drafts and posting dates.</li>
                <li>• Need another niche, market or budget? We keep a much wider creator pool.</li>
              </ul>
            </div>
            {mailto && (
              <div className="flex flex-col items-start gap-3 md:items-end">
                <a
                  href={mailto}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-[#0b1320] transition hover:opacity-90"
                  style={{ background: "#7ee8d8" }}
                >
                  Reply with your picks <ArrowUpRight size={16} />
                </a>
                <span className="text-xs text-white/50">{contactEmail}</span>
              </div>
            )}
          </div>
        </section>
      </main>

      <BrandFooter contactEmail={contactEmail} note="Confidential — prepared for client review" />
    </div>
  );
}

type PublicCreator = PublicPitchSheet["creators"][number];

function CreatorCard({ c }: { c: PublicCreator }) {
  const country = countryName(c.country);
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-md">
      <div className="flex items-start gap-4">
        <CreatorAvatar name={c.name} src={c.thumbnailUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold text-slate-900">{c.name}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            {c.handle && <span>{c.handle}</span>}
            {country && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} /> {country}
              </span>
            )}
          </div>
        </div>
      </div>
      {c.focus && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">{c.focus}</p>}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric value={compactNumber(c.subscriberCount)} label="Subscribers" />
        <Metric value={compactNumber(c.averageViews)} label="Avg views" />
        <Metric value={c.engagementRate !== null ? `${c.engagementRate.toFixed(1)}%` : "—"} label="Engagement" />
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-3.5 py-2.5">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Deliverable & rate</div>
        <div className="mt-0.5 text-sm font-medium text-slate-900">{c.rate}</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        {c.mediaKitUrl ? (
          <a
            href={c.mediaKitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
            style={{ background: BRAND_TEAL_DARK }}
          >
            <FileText size={13} /> Media kit
          </a>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3.5 py-2 text-xs text-slate-500">Media kit shared on request</span>
        )}
        {c.channelUrl && (
          <a
            href={c.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <PlayCircle size={13} /> YouTube channel
          </a>
        )}
      </div>
    </article>
  );
}

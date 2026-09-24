import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { daysLeft } from "@/lib/pitchSheet";
import { appBaseUrl, loadPublicPitchSheet, PitchSheetUnavailable, type PublicPitchSheet } from "@/lib/pitchSheetServer";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Shortlist — Fidem Growth",
  // Shared with one brand by link; not something to appear in search results.
  robots: { index: false, follow: false },
};

const TEAL = "#157a8c";

function compact(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/**
 * The no-login creator shortlist a brand opens from a pitch-sheet link. Outside the (app) route
 * group for the same reason as /media-kit/shared: no CRM chrome, no session.
 */
export default async function PitchSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  let sheet: PublicPitchSheet;
  try {
    sheet = await loadPublicPitchSheet(token, appBaseUrl(origin));
  } catch (err) {
    if (err instanceof PitchSheetUnavailable) return <Unavailable message={err.message} />;
    throw err;
  }
  await prisma.pitchSheet.update({ where: { id: sheet.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => undefined);

  const left = daysLeft(sheet.expiresAt);
  const intro = sheet.intro?.split("\n").map((l) => l.trim()).filter(Boolean) ?? [
    "Creators were selected for strong audience engagement and reach relative to rate.",
    "Open each media kit to review audience, past brand work and channel performance before deciding.",
    "A wider pool of creators is available on request, across niches, locations and budgets.",
  ];

  return (
    <main className="min-h-screen bg-slate-100 py-0 sm:py-10 print:bg-white print:py-0">
      <div className="mx-auto max-w-5xl overflow-hidden bg-white shadow-sm sm:rounded-3xl print:shadow-none">
        <header className="px-5 py-8 text-white sm:px-10 sm:py-10" style={{ background: `linear-gradient(135deg, #0e5c6b, ${TEAL})` }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold tracking-[0.2em]">FIDEM GROWTH</div>
              <div className="text-xs text-white/75">Influencer Marketing & Creator Partnerships</div>
            </div>
            <PrintButton />
          </div>
          <h1 className="mt-8 text-2xl font-bold sm:text-3xl">{sheet.title}</h1>
          <p className="mt-1 text-white/80">Prepared for {sheet.brandName}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-3 py-1">
              {sheet.creators.length} recommended creator{sheet.creators.length === 1 ? "" : "s"}
            </span>
            {left !== null && (
              <span className="rounded-full bg-white/15 px-3 py-1 print:hidden">
                Link open for {left} more day{left === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </header>

        <div className="space-y-8 px-5 py-8 sm:px-10">
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: TEAL }}>
              How this shortlist was built
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
              {intro.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: TEAL }}>
              Recommended creators
            </h2>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block print:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Creator</th>
                    <th className="px-4 py-3">Media kit</th>
                    <th className="px-4 py-3">Deliverable & rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sheet.creators.map((c) => (
                    <tr key={c.id} className="align-top">
                      <td className="w-[48%] px-4 py-4">
                        <CreatorCell c={c} />
                      </td>
                      <td className="px-4 py-4">
                        <KitLink c={c} />
                      </td>
                      <td className="px-4 py-4 text-slate-800">{c.rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden print:hidden">
              {sheet.creators.map((c) => (
                <div key={c.id} className="rounded-2xl border border-slate-200 p-4">
                  <CreatorCell c={c} />
                  <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-800">{c.rate}</div>
                  <div className="mt-3">
                    <KitLink c={c} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-slate-50 p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: TEAL }}>
              Next steps
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
              <li>Share the total budget you&apos;re working with so we can prioritise and sequence outreach.</li>
              <li>Flag the creators you&apos;d like to move forward with, or any concerns on rates or format.</li>
              <li>Tell us about other campaigns — we keep a broader creator pool and can send tailored recommendations for any brief.</li>
            </ul>
          </section>

          <footer className="border-t border-slate-200 pt-6 text-sm text-slate-600">
            <p>Thanks & regards,</p>
            <p className="font-semibold text-slate-900">The Fidem Growth Team</p>
            <p className="mt-4 text-xs text-slate-400">fidemgrowth.com · @fidemgrowth · Confidential — prepared for client review</p>
          </footer>
        </div>
      </div>
    </main>
  );
}

type PublicCreator = PublicPitchSheet["creators"][number];

function CreatorCell({ c }: { c: PublicCreator }) {
  const stats = [
    c.subscriberCount !== null && `${compact(c.subscriberCount)} subscribers`,
    c.averageViews !== null && `${compact(c.averageViews)} avg views`,
    c.engagementRate !== null && `${c.engagementRate.toFixed(1)}% engagement`,
    c.country,
  ].filter(Boolean);
  return (
    <div className="flex gap-3">
      {c.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar
        <img src={c.thumbnailUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">{c.name.slice(0, 1).toUpperCase()}</div>
      )}
      <div className="min-w-0">
        <div className="font-semibold text-slate-900">
          {c.channelUrl ? (
            <a href={c.channelUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {c.name}
            </a>
          ) : (
            c.name
          )}
        </div>
        {c.handle && c.channelUrl && (
          <a href={c.channelUrl} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline" style={{ color: TEAL }}>
            YouTube {c.handle}
          </a>
        )}
        <div className="mt-0.5 text-xs text-slate-500">{stats.join(" · ")}</div>
        {c.focus && <div className="mt-1 text-xs text-slate-600">{c.focus}</div>}
      </div>
    </div>
  );
}

function KitLink({ c }: { c: PublicCreator }) {
  if (c.mediaKitUrl) {
    return (
      <a
        href={c.mediaKitUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
        style={{ background: "#e3f2f5", color: "#0e5c6b" }}
      >
        View media kit ↗
      </a>
    );
  }
  return <span className="text-xs text-slate-400">Shared once selected</span>;
}

function Unavailable({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">Shortlist unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        <p className="mt-4 text-xs text-slate-400">fidemgrowth.com · @fidemgrowth</p>
      </div>
    </main>
  );
}

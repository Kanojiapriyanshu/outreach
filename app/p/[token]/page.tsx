import PitchSheetView from "@/app/pitch-sheet/PitchSheetView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Shortlist — Fidem Growth",
  // Shared with one brand by link; not something to appear in search results.
  robots: { index: false, follow: false },
};

/** A brand's pitch sheet at its short link: /p/<name>-<code>. */
export default async function ShortPitchSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PitchSheetView token={token} />;
}

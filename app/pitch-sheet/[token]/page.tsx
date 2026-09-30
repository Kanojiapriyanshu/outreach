import PitchSheetView from "../PitchSheetView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Shortlist — Fidem Growth",
  // Shared with one brand by link; not something to appear in search results.
  robots: { index: false, follow: false },
};

/** The original long pitch-sheet URL — still served so links already sent to brands keep working.
 * New links use the short /p/<name>-<code> form. */
export default async function PitchSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PitchSheetView token={token} />;
}

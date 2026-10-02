/**
 * Spots the two links the team shares with brands inside an outgoing email — the public creator
 * roster and a pitch sheet (a tailored shortlist) — so the CRM can record what a brand was sent
 * without anyone having to tick a box. Pure and dependency-free: used by the worker, the reply
 * route and the reply panel in the browser.
 */

// ".../roster" on any host (the app's domain differs between local, preview and production), with
// an optional ?niche=… and nothing else on the path — so "/influencers/roster", the team's own
// admin tab, and unrelated paths like "/rosters" don't count.
const ROSTER_LINK = /https?:\/\/[^\s"'<>()/]+\/roster(?![\w/-])/i;
const PITCH_SHEET_LINK = /https?:\/\/[^\s"'<>()/]+\/(?:p|pitch-sheet)\/[\w-]{6,}/i;

export function mentionsRosterLink(text: string | null | undefined): boolean {
  return !!text && ROSTER_LINK.test(text);
}

export function mentionsPitchSheetLink(text: string | null | undefined): boolean {
  return !!text && PITCH_SHEET_LINK.test(text);
}

/** Either link means creators were put in front of the brand. */
export function sharesCreators(text: string | null | undefined): boolean {
  return mentionsRosterLink(text) || mentionsPitchSheetLink(text);
}

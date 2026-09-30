/** Pure — shared by the Gmail sync (lib/gmailConversationAI.ts) and its tests. */

// Fidem's two pitches differ in how they open: a creator pitch talks to the creator about their own
// content and an opportunity *for them*; a brand pitch talks about the brand's product, its US
// momentum, or reaching an agency "agency-to-agency". Only the opening is read — the signature and
// later paragraphs share wording ("Influencer Marketing & Creator Partnerships") across both.
const OPENING_CHARS = 700;
const CREATOR_OPENING = [
  /\byour (?:content|channel|videos?|unboxing|reviews?|audience|work|proposed rate|rate)\b/i,
  /\b(?:opportunity|collaboration) for you\b/i,
  /\bcaught (?:our|my) eye\b/i,
  /\bwe work with (?:us-based )?creators on paid\b/i,
];
const BRAND_OPENING = [
  /agency[- ]side|agency-to-agency/i,
  /\bmomentum\b/i,
  /\bconverts on youtube\b/i,
  /\bfeels (?:built|perfectly|particularly)\b/i,
  /\bcreator[- ]led\b|\bcreator sourcing\b/i,
  /\bpre-vetted\b/i,
];

/** The no-AI rule, exported for tests. */
export function looksLikeCreatorPitch(subject: string, firstEmail: string): boolean {
  const opening = `${subject}\n${firstEmail.slice(0, OPENING_CHARS)}`;
  return CREATOR_OPENING.some((re) => re.test(opening)) && !BRAND_OPENING.some((re) => re.test(opening));
}

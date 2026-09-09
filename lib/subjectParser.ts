/**
 * Every outbound subject follows "{A} × {B} — description[, for {C}]" — reading which side is
 * "Fidem Growth" tells you whether this is a direct-brand or agency thread, and where the real
 * name sits: direct puts the brand first ("Quelsoft × Fidem Growth — ..."), agency puts the
 * agency in the middle and the actual client brand/campaign at the end of the description
 * ("Fidem Growth × Seedbox — Creator Sourcing Support for Hi3D"). This is far more reliable than
 * guessing from body text — it's a fixed convention, not freeform prose — so it takes priority
 * over the body-based extractor for these specific fields when it matches.
 */
export interface SubjectNames {
  brandOrAgencyName?: string;
  campaignOrProductName?: string;
  isAgency?: boolean;
}

function stripPrefixes(subject: string): string {
  return subject.replace(/^(?:(?:re|fwd?)\s*:\s*)+/gi, "").trim();
}

const FIDEM = /fidem growth/i;

export function extractNamesFromSubject(subject: string): SubjectNames {
  const s = stripPrefixes(subject);
  const match = s.match(/^(.+?)\s*[×xX]\s*(.+?)(?:\s*[—–-]\s*(.*))?$/);
  if (!match) return {};
  const [, left, right, rest] = match;
  const leftIsFidem = FIDEM.test(left);
  const rightIsFidem = FIDEM.test(right);

  if (rightIsFidem && !leftIsFidem) {
    // "{Brand} × Fidem Growth — ..." — direct-to-brand, name up front.
    const brand = left.trim();
    if (!brand) return {};
    return { brandOrAgencyName: brand, campaignOrProductName: brand, isAgency: false };
  }

  if (leftIsFidem && !rightIsFidem) {
    // "Fidem Growth × {Agency} — description for {Brand}" — agency in the middle, the actual
    // client brand/campaign (if named at all) trailing after "for" at the very end.
    const agency = right.trim();
    if (!agency) return {};
    const forMatch = rest?.match(/\bfor\s+([A-Za-z0-9&.,'’\-]+(?:\s+[A-Za-z0-9&.,'’\-]+){0,3})\s*$/i);
    const campaign = forMatch?.[1]?.trim();
    return { brandOrAgencyName: agency, campaignOrProductName: campaign || agency, isAgency: true };
  }

  return {};
}

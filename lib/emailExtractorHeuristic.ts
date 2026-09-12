import type { ExtractedBrandDetails } from "./emailExtractor";

const AGENCY_KEYWORD = /\b(agency|media group|marketing group|talent partnerships|pr agency)\b/i;

interface CategoryInfo {
  keyword: string;
  /** Brand.category free text */
  category: string;
  /** {Niche_Categories} — the reviewer niche */
  niche: string;
  /** {Target_Audience_Or_Angle} — the shopping context a buyer would be comparing this against */
  angle: string;
}

const CATEGORY_MAP: CategoryInfo[] = [
  { keyword: "AR glasses", category: "AR glasses", niche: "AR & wearable tech", angle: "next-gen AR & smart glasses" },
  { keyword: "wearable tech", category: "wearable tech", niche: "wearable tech", angle: "wearable tech upgrades" },
  { keyword: "wearable", category: "wearable tech", niche: "wearable tech", angle: "wearable tech upgrades" },
  { keyword: "smartwatch", category: "smartwatch", niche: "wearable tech", angle: "smartwatches" },
  { keyword: "headphones", category: "headphones", niche: "audio tech", angle: "wireless headphones" },
  { keyword: "earbuds", category: "earbuds", niche: "audio tech", angle: "wireless earbuds" },
  { keyword: "webcam", category: "webcam", niche: "tech & streaming setup", angle: "streaming & WFH setup" },
  { keyword: "tech gadget", category: "tech gadget", niche: "tech gadget", angle: "everyday tech gadgets" },
  { keyword: "gaming", category: "gaming", niche: "gaming", angle: "gaming gear" },
  { keyword: "software", category: "software", niche: "software & SaaS", angle: "productivity software" },
  { keyword: "mobile app", category: "mobile app", niche: "app & software", angle: "mobile apps" },
  { keyword: "skincare", category: "skincare", niche: "beauty & skincare", angle: "skincare routines" },
  { keyword: "beauty", category: "beauty", niche: "beauty", angle: "beauty routines" },
  { keyword: "supplement", category: "supplement", niche: "health & wellness", angle: "health & wellness supplements" },
  { keyword: "apparel", category: "apparel", niche: "fashion", angle: "everyday fashion picks" },
  { keyword: "footwear", category: "footwear", niche: "footwear", angle: "everyday footwear" },
  { keyword: "fitness", category: "fitness", niche: "fitness", angle: "home fitness gear" },
  { keyword: "home decor", category: "home decor", niche: "home & lifestyle", angle: "home & lifestyle upgrades" },
  { keyword: "kitchenware", category: "kitchenware", niche: "kitchen & home", angle: "kitchen essentials" },
  { keyword: "subscription box", category: "subscription box", niche: "lifestyle", angle: "subscription box picks" },
  { keyword: "finance app", category: "finance app", niche: "finance", angle: "personal finance tools" },
  { keyword: "VPN", category: "VPN", niche: "tech & VPN", angle: "VPN & online privacy tools" },
  { keyword: "ergonomic chair", category: "ergonomic chairs", niche: "home office & productivity", angle: "ergonomic office chairs" },
  { keyword: "office chair", category: "office chairs", niche: "home office & productivity", angle: "office chair upgrades" },
  { keyword: "standing desk", category: "standing desks", niche: "home office & productivity", angle: "standing desk setups" },
  { keyword: "furniture", category: "furniture", niche: "home & lifestyle", angle: "home office furniture" },
];

const DELIVERABLE_KEYWORDS = [
  "YouTube Video",
  "YouTube Short",
  "Instagram Reel",
  "Instagram Post",
  "Instagram Story",
  "TikTok Video",
  "Link in Bio",
  "Writelisting",
  "Unboxing",
  "Dedicated Review",
  "Integrated Segment",
  "Sponsored Post",
];

const SIGNOFF_LINE =
  /^(regards|best(?: regards)?|thanks(?: & regards)?|sincerely|thank you|talk soon|cheers|warmly|kind regards|many thanks|looking forward)[,.]?\s*$/i;
const COMPANY_SUFFIX_HINT = /\b(team|media|agency|group|inc|llc|studio|partners)\b/i;

/** Trims whitespace and stray full-width/decorative punctuation left over from regex captures. */
function cleanValue(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[！-～]+$/g, "") // full-width punctuation range
    .replace(/[!？，、。]+$/g, "")
    .trim();
}

/** Strips a trailing "Team" ("EezyCollab Team" -> "EezyCollab") on top of the usual cleanup. */
function cleanCompanyName(raw: string): string {
  return cleanValue(raw).replace(/\s+team$/i, "").trim();
}

/** Looks at the 1-2 lines right after a sign-off line ("Best regards,") to split out a person's name vs. a company. */
function parseSignature(text: string): { personName?: string; company?: string } {
  const lines = text.split("\n").map((l) => l.trim());
  const signoffIndex = lines.findIndex((l) => SIGNOFF_LINE.test(l));
  if (signoffIndex === -1) return {};

  const after = lines.slice(signoffIndex + 1).filter((l) => l.length > 0);
  if (after.length === 0) return {};

  const first = after[0];
  const looksLikeCompanyLine = COMPANY_SUFFIX_HINT.test(first) || first.split(/\s+/).length > 2;

  if (looksLikeCompanyLine) {
    return { company: cleanCompanyName(first) || first };
  }
  // First line reads like a person's first name; the next non-empty line (if any) is the company.
  const isPersonName = /^[A-Z][a-zA-Z'-]{1,20}$/.test(first);
  return { personName: isPersonName ? first : undefined, company: after[1] ? cleanCompanyName(after[1]) : undefined };
}

/** Grabs the text right after a sign-off ("Best regards,\nJoanna") — usually the sender's first name. */
function extractContactName(text: string): string | undefined {
  const fromSignature = parseSignature(text).personName;
  if (fromSignature) return fromSignature;
  const introMatch = text.match(/\b(?:my name is|i'?m|this is) ([A-Z][a-zA-Z'-]{1,20})\b/i);
  return introMatch?.[1];
}

/** "Hello SABALA Team," / "Hi Kris," at the very start of an email WE wrote — the addressee's
 * name/company, not ours. Only meaningful when extracting from our own outbound text (see
 * `isOutbound` below); running this on an inbound reply would grab whoever THEY greeted (us). */
function extractGreetingAddressee(text: string): string | undefined {
  const match = text.match(/^\s*(?:Hi|Hello|Hey|Dear)\s+([A-Z][A-Za-z0-9&'’.\- ]{1,40}?)[,!\n]/m);
  return match ? cleanCompanyName(match[1]) : undefined;
}

const GENERIC_LEAD_WORDS = /^(a|an|the|our|leading|upcoming)\b/i;

/**
 * Finds the CLIENT brand being represented/discussed — "on behalf of X", "working with X",
 * "partnering with X", "representing X", "collaborating with X" — as opposed to the sender's
 * own company (which comes from the signature/"from X" instead). Only treated as a real brand
 * name if it doesn't read as a generic description ("a leading company in...").
 */
function extractOnBehalfOf(text: string): string | undefined {
  const patterns = [
    /on behalf of ([A-Za-z0-9&.,'’\- ]{2,40}?)[,.\n]/i,
    /working with ([A-Z][A-Za-z0-9&'’\- ]{1,30}?)\s+on\b/i,
    /partner(?:ing|ed)? with ([A-Z][A-Za-z0-9&'’\- ]{1,30}?)[,.\n ]/i,
    /collaborat(?:e|ing) with ([A-Z][A-Za-z0-9&'’\- ]{1,30}?)[,.\n ]/i,
    /\brepresenting ([A-Z][A-Za-z0-9&'’\- ]{1,30}?)[,.\n]/i,
    // "a campaign for one of our clients, X" / "our client X" — an agency naming the brand it's
    // actually pitching, as opposed to its own name (which comes from the signature instead).
    /\b(?:one of )?our clients?,?\s+([A-Z][A-Za-z0-9&'’\- ]{1,30}?)[,.\n]/i,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const captured = text.match(patterns[i])?.[1]?.trim();
    if (!captured || GENERIC_LEAD_WORDS.test(captured)) continue;
    // Patterns after the first use [A-Z] intending "looks like a proper noun", but the /i flag
    // on the whole regex makes that match lowercase too (e.g. "partner with creators" would
    // otherwise capture "creators"). Enforce it for real here, on the literal captured text.
    if (i > 0 && !/^[A-Z]/.test(captured)) continue;
    return cleanCompanyName(captured);
  }
  return undefined;
}

/**
 * The sender's own company, from patterns other than a signature block: "from Y" ("I'm Sarah from
 * Y"), "founder/CEO/owner of Y" ("founder of GlowLab"), or a role tacked onto "at Y" ("Talent
 * Partnerships Manager at BrightWave Media"). Tried in this order since "from" is the most
 * reliable — "at" alone is common in unrelated phrases ("looking at", "great at"), so it's scoped
 * to directly following a capitalized noun phrase, which those don't have.
 */
function extractFromCompany(text: string): string | undefined {
  const fromMatch = text.match(/\bfrom ([A-Z][A-Za-z0-9&.,'’\- ]{1,40}?)[,.\n]/);
  if (fromMatch) return cleanCompanyName(fromMatch[1]);

  const roleMatch = text.match(/\b(?:founder|co-founder|ceo|owner|head|manager) (?:of|at) ([A-Z][A-Za-z0-9&'’\- ]{1,40}?)[,.\n]/i);
  if (roleMatch) return cleanCompanyName(roleMatch[1]);

  const atMatch = text.match(/\b(?:manager|director|lead|specialist|coordinator|representative) at ([A-Z][A-Za-z0-9&'’\- ]{1,40}?)[,.\n]/i);
  return atMatch ? cleanCompanyName(atMatch[1]) : undefined;
}

function extractEmail(text: string): string | undefined {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0];
}

function findCategoryMatch(text: string): CategoryInfo | undefined {
  const lower = text.toLowerCase();
  return CATEGORY_MAP.find((c) => lower.includes(c.keyword.toLowerCase()));
}

/**
 * A last-resort raw category when the product isn't one of CATEGORY_MAP's curated keywords —
 * that list can only ever cover the categories someone thought to add, so a category-only field
 * ({Niche_Categories}/{Target_Audience_Or_Angle} still need the curated phrasing to sound natural
 * and are left blank here) shouldn't come back empty just because this is the first email about,
 * say, a smart-home hub or a project management tool. Looks for "launching their new X" /
 * "our new X" — the phrasing a pitch almost always uses to name the actual product.
 */
function extractCategoryFallback(text: string): string | undefined {
  const match = text.match(/\b(?:launching|introducing|announcing)\s+(?:their|our|its)?\s*new\s+([a-z][a-z0-9 &-]{2,30}?)[.,!\n]/i);
  return match ? cleanValue(match[1]) : undefined;
}

/**
 * {Target_Audience_Or_Angle} — what shopping context the reviewer's audience would be comparing
 * this against ("WFH setup", "wireless earbuds"). Prefers an explicit comparison phrase if the
 * email states one; otherwise derives it from the detected product category.
 */
function extractTargetAudienceOrAngle(text: string, categoryMatch: CategoryInfo | undefined): string | undefined {
  const explicit = text.match(
    /\b(?:audience|creators?|viewers?)\s+(?:who are |that are |actively )?(?:comparing|researching|shopping for|looking for)\s+([^.\n]+)/i
  );
  if (explicit) return cleanValue(explicit[1]);
  return categoryMatch?.angle;
}

function extractDeliverables(text: string): string | undefined {
  const found = DELIVERABLE_KEYWORDS.filter((k) => new RegExp(k.replace(/\s+/g, "\\s+"), "i").test(text));
  return found.length > 0 ? found.join(", ") : undefined;
}

function toSubscriberCount(num: string, unit: string): number {
  const n = parseFloat(num);
  return unit.toLowerCase() === "m" ? n * 1_000_000 : n * 1_000;
}

/**
 * "50K-500K subscribers" / "50K to 500K followers" — the range form is tried first since the
 * plain single-number scan below only requires a keyword immediately after the LAST number, so
 * on a range it would only ever see "500K" and silently drop the "50K" lower bound.
 */
function extractInfluencerRange(text: string): { min?: number; max?: number } {
  const rangeMatch = text.match(
    /(\d+(?:\.\d+)?)\s*([kKmM])\+?\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*([kKmM])\+?\s*(?=subscribers|followers|audience|views|$|\s|,|\.)/i
  );
  if (rangeMatch) {
    const [, num1, unit1, num2, unit2] = rangeMatch;
    return { min: toSubscriberCount(num1, unit1), max: toSubscriberCount(num2, unit2) };
  }

  const tokens = [...text.matchAll(/(\d+(?:\.\d+)?)\s*([kKmM])\+?\s*(?=subscribers|followers|audience|views|$|\s|,|\.)/g)];
  const values = tokens.map(([, num, unit]) => toSubscriberCount(num, unit));
  if (values.length === 0) return {};
  return { min: Math.min(...values), max: Math.max(...values) };
}

function extractBudget(text: string): { text?: string; type?: ExtractedBrandDetails["budgetType"] } {
  // "affiliate", "rev share", etc. between the % and "commission" used to fall through to the
  // dollar match below (or nothing at all), since the old pattern required "commission" right
  // after the number with only "pure" allowed in between.
  const commission = text.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:\w+\s+)?commission/i);
  const dollarRange = text.match(/\$[\d,]+(?:\.\d+)?(?:\s*[-–—to]+\s*\$?[\d,]+(?:\.\d+)?)?/);
  const productOnly = /free samples?|product only|no cash|complimentary product/i.test(text);

  // "either $500 or 15% commission, your choice" — a real offer, not a typo — so it's recorded as
  // both figures rather than only the one whichever regex happened to match first.
  if (commission && dollarRange && /\b(?:either|your choice|whichever)\b/i.test(text)) {
    return { text: `${dollarRange[0]} or ${commission[1]}% commission`, type: "HYBRID" };
  }

  if (commission) {
    return {
      text: `${commission[1]}% commission${productOnly ? ", product only" : ""}`,
      type: productOnly ? "HYBRID" : "COMMISSION",
    };
  }

  if (dollarRange) return { text: dollarRange[0], type: "FLAT_FEE" };

  if (productOnly) return { text: "Product only", type: "PRODUCT_ONLY" };

  return {};
}

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
function extractCampaignTimeline(text: string): string | undefined {
  // "-"/"to" for "Oct 5-20", "and" for "between Oct 5 and Oct 20" — both show up about equally
  // often in the wild.
  const re = new RegExp(`${MONTH}\\.?\\s*\\d{1,2}\\s*(?:[-–—]|\\s+(?:to|and)\\s+)\\s*(?:${MONTH}\\.?\\s*)?\\d{1,2}`, "i");
  const match = text.match(re);
  return match?.[0].replace(/\s+/g, " ").trim();
}

/** Captured text that just introduces a list ("either our:", "one of the following:") rather than naming an actual feature. */
const LIST_INTRO_CAPTURE = /^(either|one of|any of|some of|the following)\b/i;

/**
 * The descriptive clause about the product itself, used as {Key_Product_Features}. Prefers
 * "specializing/specializes in X" ("an ergonomic chair brand specializing in innovative workspace
 * solutions" -> "innovative workspace solutions") or "on their/its X" ("working with DubbingAI on
 * their voice changer earbuds" -> "voice changer earbuds") since those name the actual product;
 * falls back to a "creating/offering/featuring X" clause otherwise, skipping matches that just
 * introduce an enumerated list of options ("featuring either our: ...") instead of naming one.
 */
function extractKeyProductFeatures(text: string): string | undefined {
  const specializingMatch = text.match(/\bspecializ(?:ing|es) in ([^.\n]+)/i);
  if (specializingMatch) return cleanValue(specializingMatch[1]);

  const onTheirMatch = text.match(/\bon (?:their|its) ([^.\n,]+?)(?=\s+and\b|[.,\n])/i);
  if (onTheirMatch) return cleanValue(onTheirMatch[1]);

  const match = text.match(/\b(?:creating|offering|featuring|providing|delivering|showcasing)\s+([^.\n]+)/i);
  if (!match) return undefined;
  const captured = match[1].trim();
  if (LIST_INTRO_CAPTURE.test(captured) || captured.endsWith(":")) return undefined;
  return cleanValue(captured);
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => {
    // Preserve short all-caps acronyms (AR, VR, AI, VPN) instead of lowercasing them to "Ar", "Vr", etc.
    if (w.length <= 4 && w === w.toUpperCase()) return w;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/\b(team|inc|llc|media|group|agency|the)\b/g, "").replace(/[^a-z0-9]/g, "").trim();
}

/** True if two company names share a meaningful core token (e.g. "libernovo" vs "libernovo Team"). */
function namesOverlap(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Regex/keyword-based extraction — no API key or network call required. This is the default
 * path; the LLM extractor (lib/emailExtractor.ts) is only used on top of this when
 * ANTHROPIC_API_KEY is configured, for cases this can't reliably catch (nuanced phrasing).
 *
 * `isOutbound` — set when extracting from an email WE wrote (e.g. Email 1, attached after the
 * fact with no reply yet) rather than one the brand/creator sent us. Signature-based patterns
 * ("from X", "on behalf of X") would otherwise misattribute OUR OWN identity as theirs, and the
 * sign-off name would grab whoever WE signed as, not them — so those are skipped in favor of the
 * greeting line ("Hello SABALA Team,"), which is the one part of an outbound email that actually
 * names the recipient.
 */
export function extractBrandDetailsHeuristic(rawEmailText: string, opts: { isOutbound?: boolean } = {}): ExtractedBrandDetails {
  const text = rawEmailText.trim();
  if (!text) return {};

  if (opts.isOutbound) {
    const greetedName = extractGreetingAddressee(text);
    const categoryMatch = findCategoryMatch(text);
    const { min, max } = extractInfluencerRange(text);
    const budget = extractBudget(text);
    const result: ExtractedBrandDetails = {
      brandOrAgencyName: greetedName,
      campaignOrProductName: greetedName,
      isAgency: false,
      category: categoryMatch?.category ?? extractCategoryFallback(text),
      nicheCategories: categoryMatch?.niche,
      keyProductFeatures: extractKeyProductFeatures(text),
      targetAudienceOrAngle: extractTargetAudienceOrAngle(text, categoryMatch),
      budgetRangeText: budget.text,
      budgetType: budget.type,
      influencerRangeMin: min,
      influencerRangeMax: max,
      deliverables: extractDeliverables(text),
      campaignTimeline: extractCampaignTimeline(text),
    };
    return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined)) as ExtractedBrandDetails;
  }

  const onBehalfOf = extractOnBehalfOf(text);
  const signerName = parseSignature(text).company ?? extractFromCompany(text);

  // "On behalf of X" where the signature is also X ("...on behalf of libernovo" / signed "libernovo Team")
  // is the brand talking about itself in the third person, not an outside agency.
  const selfReferential = !!(onBehalfOf && signerName && namesOverlap(onBehalfOf, signerName));
  const signerLooksLikeAgency = !!signerName && COMPANY_SUFFIX_HINT.test(signerName) && /media|agency|group|partners/i.test(signerName);
  const isAgency = AGENCY_KEYWORD.test(text) || signerLooksLikeAgency || (!!onBehalfOf && !selfReferential);

  // Who Fidem is emailing (shows in the CRM) — the agency itself when it's an agency, else the brand.
  const brandOrAgencyName = isAgency ? signerName ?? onBehalfOf : onBehalfOf ?? signerName;

  const categoryMatch = findCategoryMatch(text);
  const categoryFallback = categoryMatch ? undefined : extractCategoryFallback(text);

  // What actually goes in the email as {Brand_Or_Campaign_Name} — the CLIENT brand's name, never
  // the agency's own name. When an agency doesn't name their client (common — they often only
  // describe the product), fall back to the product category itself ("AR Glasses") rather than
  // reusing the agency's identity, which would read as nonsense ("leading the Meridian Media campaign").
  const campaignOrProductName = isAgency
    ? (onBehalfOf && !selfReferential ? onBehalfOf : undefined) ??
      (categoryMatch ? titleCase(categoryMatch.category) : categoryFallback ? titleCase(categoryFallback) : undefined)
    : onBehalfOf ?? signerName;

  const { min, max } = extractInfluencerRange(text);
  const budget = extractBudget(text);

  const result: ExtractedBrandDetails = {
    brandOrAgencyName,
    campaignOrProductName,
    isAgency,
    contactName: extractContactName(text),
    contactEmail: extractEmail(text),
    category: categoryMatch?.category ?? categoryFallback,
    nicheCategories: categoryMatch?.niche,
    keyProductFeatures: extractKeyProductFeatures(text),
    targetAudienceOrAngle: extractTargetAudienceOrAngle(text, categoryMatch),
    budgetRangeText: budget.text,
    budgetType: budget.type,
    influencerRangeMin: min,
    influencerRangeMax: max,
    deliverables: extractDeliverables(text),
    campaignTimeline: extractCampaignTimeline(text),
  };

  // Drop undefined keys so the caller can tell what was actually found.
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined)) as ExtractedBrandDetails;
}

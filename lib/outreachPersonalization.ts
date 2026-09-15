/**
 * Fills the influencer Email 1 variables from what a creator actually posts, so a pitch reads like
 * someone watched the channel without anyone typing it by hand:
 *
 *   {Content_Highlights}        "home styling, affordable upgrade, and midlife lifestyle content"
 *   {Niche_Or_Product_Category} the brand's space — the campaign's, or the creator's closest match
 *   {Deliverable_Type}          the video being shortlisted — the campaign's, or a dedicated review
 *
 * Highlights come only from topics that recur in the creator's recent video titles (and tags), so
 * nothing is claimed about a channel that its uploads don't show. The brand category and the video
 * type are really campaign facts; when the campaign doesn't say, they default from the creator's
 * strongest topic and stay editable. Pure — no network or database — so it's unit-tested directly.
 */

export interface PersonalizationInput {
  channelTitle: string;
  description?: string | null;
  videoTitles: string[];
  videoTags?: string[];
  campaign?: { brandCategory?: string | null; deliverable?: string | null };
  /** A category the team already attached (e.g. the Campaign Match product), used if no topic maps. */
  nicheHint?: string | null;
}

export interface PersonalizedVariables {
  Creator_Name: string;
  Content_Highlights: string;
  Niche_Or_Product_Category: string;
  Deliverable_Type: string;
}

export interface PersonalizationResult {
  variables: PersonalizedVariables;
  /** The recurring topics behind Content_Highlights, with how many recent titles mention each. */
  topics: { phrase: string; videos: number }[];
  /** Where the brand category and the video type came from. */
  categorySource: "campaign" | "channel" | "niche" | "default";
  deliverableSource: "campaign" | "default";
}

interface Topic {
  /** Reads as a modifier before "content": "home styling content". */
  phrase: string;
  pattern: RegExp;
  /** The brand space a creator strong in this topic most naturally fits. */
  category?: string;
}

// Ordered from specific to broad: when two topics tie, the more specific one leads the phrase.
const TOPICS: Topic[] = [
  { phrase: "midlife lifestyle", pattern: /\b(over (40|50|60)|in (my|your|our) (40s|50s|60s)|midlife|mid-life|menopause|empty nest)/i, category: "lifestyle" },
  { phrase: "home styling", pattern: /\b(home decor|decor|decorat\w*|styling (my|the|a|our) (home|room|space|shelves)|home styl\w*|cozy home)/i, category: "home furniture/living" },
  { phrase: "home makeover", pattern: /\b(makeover|renovat\w*|remodel\w*|room refresh|before (and|&) after|transformation)/i, category: "home furniture/living" },
  // Phrases never contain "and" themselves — they're joined into "a, b, and c content".
  { phrase: "furniture", pattern: /\b(furniture|sofa|couch|sectional|living room|dining table|recliner)/i, category: "home furniture/living" },
  { phrase: "small-space living", pattern: /\b(small space|small apartment|studio apartment|tiny (home|house)|apartment (tour|makeover|decor)|rv life|van life)/i, category: "home furniture/living" },
  { phrase: "bedroom", pattern: /\b(mattress|bedroom|bedding|sleep (routine|better)|pillow)/i, category: "bedding & mattresses" },
  { phrase: "affordable upgrade", pattern: /\b(budget|affordable|cheap|dupes?|under \$?\d+|for less|save money|frugal|thrift\w*|upgrades?)\b/i },
  { phrase: "shopping haul", pattern: /\b(amazon (finds|must.?haves|favorites|favourites)|haul|target (finds|run)|walmart finds|costco (finds|haul)|tj ?maxx)/i },
  { phrase: "home organization", pattern: /\b(organi[sz]\w*|declutter\w*|clean with me|cleaning (motivation|routine|hacks)|restock)/i, category: "home & cleaning" },
  { phrase: "cooking", pattern: /\b(recipes?|cook\w*|kitchen|meal prep|baking|air ?fryer|dinner ideas)/i, category: "kitchen & home appliances" },
  { phrase: "product review", pattern: /\b(reviews?|honest (opinion|thoughts)|worth it|tested|comparison|vs\.?)\b/i },
  { phrase: "unboxing", pattern: /\bunbox\w*/i },
  { phrase: "beauty", pattern: /\b(makeup|skin ?care|beauty|hair ?care|grwm|get ready with me)/i, category: "beauty & personal care" },
  { phrase: "fashion", pattern: /\b(outfits?|fashion|what i wore|lookbook|try.?on|style tips|capsule wardrobe)/i, category: "fashion & apparel" },
  { phrase: "fitness", pattern: /\b(workouts?|fitness|gym|exercise|weight loss|pilates|yoga|treadmill|walking pad)/i, category: "fitness & wellness" },
  { phrase: "wellness", pattern: /\b(wellness|self.?care|mental health|healthy habits|morning routine)/i, category: "health & wellness" },
  { phrase: "tech", pattern: /\b(tech|gadgets?|iphone|android|laptop|pc build|desk setup|setup tour|smart home)/i, category: "consumer tech" },
  { phrase: "gaming", pattern: /\b(gaming|gameplay|playthrough|let'?s play|minecraft|fortnite)/i, category: "gaming" },
  { phrase: "family", pattern: /\b(mom|mum|motherhood|parenting|family (vlog|life|of \d)|toddler|kids|baby)\b/i, category: "family & kids" },
  { phrase: "day-in-the-life", pattern: /\b(day in (my|the) life|week in (my|the) life|vlog\w*|routine)\b/i, category: "lifestyle" },
  { phrase: "DIY", pattern: /\b(diy|woodworking|build (a|an|my|our)|crafts?)\b/i, category: "home improvement & tools" },
  { phrase: "outdoor living", pattern: /\b(garden\w*|backyard|patio|outdoor living|lawn)/i, category: "outdoor & garden" },
  { phrase: "outdoor adventure", pattern: /\b(camping|hiking|backpacking|overlanding)/i, category: "outdoor gear" },
  { phrase: "travel", pattern: /\b(travel\w*|vacation|road trip|hotel|airbnb)/i, category: "travel" },
  { phrase: "pet", pattern: /\b(dogs?|puppy|cats?|kitten|pets?)\b/i, category: "pet products" },
  { phrase: "car", pattern: /\b(cars?|trucks?|detailing|automotive)\b/i, category: "automotive" },
  { phrase: "personal finance", pattern: /\b(money|budgeting|personal finance|investing|side hustle)/i, category: "finance" },
  { phrase: "food", pattern: /\b(food review|mukbang|taste test|trying (every|the))/i, category: "food & beverage" },
  { phrase: "photography", pattern: /\b(camera|photography|filmmaking|lens)\b/i, category: "cameras & creator gear" },
];

/** Topics that describe a format rather than a subject — never lead, and never set the category. */
const FORMAT_PHRASES = new Set(["product review", "unboxing", "day-in-the-life", "shopping haul", "affordable upgrade"]);

export const DEFAULT_DELIVERABLE = "dedicated review";

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return `${phrases[0]} content`;
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]} content`;
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]} content`;
}

export function rankTopics(input: Pick<PersonalizationInput, "videoTitles" | "videoTags" | "description">): { topic: Topic; videos: number }[] {
  const titles = input.videoTitles.filter((t) => t && t.trim());
  const tagText = (input.videoTags ?? []).join(" ");
  const description = input.description ?? "";
  return TOPICS.map((topic, order) => {
    const videos = titles.filter((t) => topic.pattern.test(t)).length;
    // Tags and the description corroborate a topic but can't carry one alone — they're often
    // boilerplate — so they only add weight to topics the titles already show.
    const bonus = videos > 0 ? (topic.pattern.test(tagText) ? 0.5 : 0) + (topic.pattern.test(description) ? 0.5 : 0) : 0;
    return { topic, videos, weight: videos + bonus, order };
  })
    .filter((t) => t.videos > 0)
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .map(({ topic, videos }) => ({ topic, videos }));
}

export function personalizeFromChannel(input: PersonalizationInput): PersonalizationResult {
  const titleCount = input.videoTitles.filter((t) => t && t.trim()).length;
  // A topic must recur, not appear once: at least 2 titles (or 1 when there are very few uploads).
  const minVideos = titleCount >= 6 ? Math.max(2, Math.round(titleCount * 0.12)) : 1;
  const ranked = rankTopics(input).filter((t) => t.videos >= minVideos);

  const subjects = ranked.filter((t) => !FORMAT_PHRASES.has(t.topic.phrase));
  const formats = ranked.filter((t) => FORMAT_PHRASES.has(t.topic.phrase));
  const chosen = [...subjects.slice(0, 3), ...formats].slice(0, 3);
  // Keep the subject topics first so the sentence leads with what the channel is about.
  const ordered = [...chosen.filter((t) => !FORMAT_PHRASES.has(t.topic.phrase)), ...chosen.filter((t) => FORMAT_PHRASES.has(t.topic.phrase))];

  const campaignCategory = input.campaign?.brandCategory?.trim();
  const channelCategory = subjects.find((t) => t.topic.category)?.topic.category;
  const nicheHint = input.nicheHint?.trim();
  const [brandCategory, categorySource]: [string, PersonalizationResult["categorySource"]] = campaignCategory
    ? [campaignCategory, "campaign"]
    : channelCategory
      ? [channelCategory, "channel"]
      : nicheHint
        ? [nicheHint, "niche"]
        : ["lifestyle", "default"];

  const campaignDeliverable = input.campaign?.deliverable?.trim();

  return {
    variables: {
      Creator_Name: input.channelTitle.trim(),
      Content_Highlights: joinPhrases(ordered.map((t) => t.topic.phrase)) || "videos",
      Niche_Or_Product_Category: brandCategory,
      Deliverable_Type: campaignDeliverable || DEFAULT_DELIVERABLE,
    },
    topics: ordered.map((t) => ({ phrase: t.topic.phrase, videos: t.videos })),
    categorySource,
    deliverableSource: campaignDeliverable ? "campaign" : "default",
  };
}

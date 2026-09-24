import "server-only";
import { prisma } from "@/lib/prisma";
import { searchTerms, type KitTitleMatches } from "@/lib/creatorRoster";

// Video titles from a creator's latest media kit: their top videos plus recent uploads. Titles are
// where past brand work shows up ("SwitchBot Lock Pro review", "I tried a smart home for 30 days").
const KIT_TITLES_SQL = `
  SELECT v->>'title' AS title
  FROM jsonb_array_elements(
    (CASE WHEN jsonb_typeof(k.data->'topVideos') = 'array' THEN k.data->'topVideos' ELSE '[]'::jsonb END) ||
    (CASE WHEN jsonb_typeof(k.data->'recentUploads') = 'array' THEN k.data->'recentUploads' ELSE '[]'::jsonb END)
  ) v
`;

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** For each search word, the creators whose media-kit video titles contain it. */
export async function findKitTitleMatches(q: string): Promise<KitTitleMatches> {
  const terms = searchTerms(q);
  const out: KitTitleMatches = {};
  await Promise.all(
    terms.map(async (term) => {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT c.id FROM "Creator" c
         JOIN "ChannelMediaKit" k ON k.id = c."mediaKitId"
         WHERE EXISTS (SELECT 1 FROM (${KIT_TITLES_SQL}) t WHERE t.title ILIKE $1)`,
        `%${escapeLike(term)}%`
      );
      out[term] = rows.map((r) => r.id);
    })
  );
  return out;
}

/** Video titles for a page of creators' media kits, keyed by media kit id — only fetched when a
 * search is active, to explain which video matched. */
export async function kitTitlesByKitId(kitIds: string[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(kitIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<{ id: string; titles: string[] | null }[]>(
    `SELECT k.id, ARRAY(SELECT t.title FROM (${KIT_TITLES_SQL}) t WHERE t.title IS NOT NULL) AS titles
     FROM "ChannelMediaKit" k WHERE k.id = ANY($1::text[])`,
    ids
  );
  return new Map(rows.map((r) => [r.id, r.titles ?? []]));
}

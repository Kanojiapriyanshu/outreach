import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expiryFromDays } from "@/lib/pitchSheet";
import { appBaseUrl, creatorEligibility } from "@/lib/pitchSheetServer";

const MAX_CREATORS = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface CreateBody {
  brandName?: string;
  brandEmail?: string;
  title?: string;
  intro?: string;
  expiresInDays?: number;
  items?: { creatorId: string; brandRate?: number | null; brandRateCurrency?: string | null; deliverable?: string | null; rateNote?: string | null }[];
}

function clean(value: unknown, max = 500): string | null {
  const text = typeof value === "string" ? value.trim().slice(0, max) : "";
  return text || null;
}

/**
 * Make a pitch sheet from the selected creators. Anyone who hasn't replied and has no rate is left
 * out (and listed back as skipped) — the dialog shows the same rule before this is ever called.
 */
export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const brandName = clean(body.brandName, 120);
  if (!brandName) return NextResponse.json({ error: "Enter the brand's name" }, { status: 400 });
  const brandEmail = clean(body.brandEmail, 200);
  if (brandEmail && !EMAIL_RE.test(brandEmail)) return NextResponse.json({ error: "That brand email doesn't look right" }, { status: 400 });

  const seen = new Set<string>();
  const requested = (body.items ?? []).filter((i) => typeof i?.creatorId === "string" && !seen.has(i.creatorId) && seen.add(i.creatorId));
  if (requested.length === 0) return NextResponse.json({ error: "Pick at least one creator" }, { status: 400 });
  if (requested.length > MAX_CREATORS) return NextResponse.json({ error: `At most ${MAX_CREATORS} creators per sheet` }, { status: 400 });

  const eligibility = await creatorEligibility(requested.map((i) => i.creatorId));
  const included = requested.filter((i) => eligibility.get(i.creatorId)?.ready);
  const skipped = requested
    .filter((i) => !eligibility.get(i.creatorId)?.ready)
    .map((i) => ({ creatorId: i.creatorId, name: eligibility.get(i.creatorId)?.name ?? "Unknown creator", reason: eligibility.has(i.creatorId) ? "Hasn't replied and no rate yet" : "Not found" }));
  if (included.length === 0) {
    return NextResponse.json({ error: "None of these creators has replied or given a rate yet, so there's nothing to show the brand.", skipped }, { status: 400 });
  }

  const sheet = await prisma.pitchSheet.create({
    data: {
      token: randomBytes(24).toString("base64url"),
      title: clean(body.title, 160) ?? `Creator shortlist for ${brandName}`,
      brandName,
      brandEmail,
      intro: clean(body.intro, 4000),
      expiresAt: expiryFromDays(typeof body.expiresInDays === "number" ? body.expiresInDays : undefined),
      items: {
        create: included.map((i, position) => ({
          creatorId: i.creatorId,
          position,
          brandRate: typeof i.brandRate === "number" && Number.isFinite(i.brandRate) && i.brandRate >= 0 ? i.brandRate : null,
          brandRateCurrency: clean(i.brandRateCurrency, 3)?.toUpperCase() ?? null,
          deliverable: clean(i.deliverable, 120),
          rateNote: clean(i.rateNote, 300),
        })),
      },
    },
  });

  const base = appBaseUrl(req.nextUrl.origin);
  return NextResponse.json({
    id: sheet.id,
    url: `${base}/pitch-sheet/${sheet.token}`,
    csvUrl: `${base}/api/pitch-sheets/public/${sheet.token}/csv`,
    expiresAt: sheet.expiresAt?.toISOString() ?? null,
    included: included.length,
    skipped,
  });
}

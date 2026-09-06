import { NextRequest, NextResponse } from "next/server";
import { gmailClientFor, findSentThreadTo } from "@/lib/gmail";
import { trackSequence, composeAndSendInitialEmail } from "@/lib/trackSequence";

interface BulkRow {
  contactEmail: string;
  contactName: string;
  recipientType?: "DIRECT" | "AGENCY";
  brandName?: string;
  campaignName?: string;
  website?: string;
  category?: string;
  budgetRangeText?: string;
  budgetType?: "FLAT_FEE" | "COMMISSION" | "PRODUCT_ONLY" | "HYBRID" | "UNKNOWN";
  influencerRangeMin?: number;
  influencerRangeMax?: number;
  deliverables?: string;
  campaignTimeline?: string;
  creatorName?: string;
  channelName?: string;
  channelUrl?: string;
  variables: Record<string, string>;
}

interface BulkBody {
  mode: "attach" | "compose";
  outreachType: "BRAND" | "CREATOR";
  emailAccountId: string;
  rows: BulkRow[];
}

interface RowResult {
  contactEmail: string;
  status: "tracked" | "sent" | "duplicate" | "no_sent_email_found" | "error";
  detail?: string;
}

function buildBrand(row: BulkRow) {
  return {
    name: row.brandName ?? row.contactName,
    campaignName: row.campaignName,
    website: row.website,
    category: row.category,
    budgetRangeText: row.budgetRangeText,
    budgetType: row.budgetType,
    influencerRangeMin: row.influencerRangeMin,
    influencerRangeMax: row.influencerRangeMax,
    deliverables: row.deliverables,
    campaignTimeline: row.campaignTimeline,
  };
}

function buildCreator(row: BulkRow) {
  return {
    name: row.creatorName ?? row.contactName,
    channelName: row.channelName,
    channelUrl: row.channelUrl,
    niche: row.variables?.Niche_Or_Product_Category,
  };
}

export async function POST(req: NextRequest) {
  const { mode, outreachType, emailAccountId, rows }: BulkBody = await req.json();

  if (!outreachType || !emailAccountId || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "outreachType, emailAccountId, and rows are required" }, { status: 400 });
  }
  if (rows.length > 200) {
    return NextResponse.json({ error: "Max 200 rows per import" }, { status: 400 });
  }

  const results: RowResult[] = [];

  if (mode === "compose") {
    for (const row of rows) {
      if (!row.contactEmail) {
        results.push({ contactEmail: "", status: "error", detail: "Missing contact email" });
        continue;
      }
      try {
        const result = await composeAndSendInitialEmail({
          outreachType,
          recipientType: row.recipientType,
          emailAccountId,
          contactEmail: row.contactEmail,
          contactName: row.contactName,
          brand: outreachType === "BRAND" ? buildBrand(row) : undefined,
          creator: outreachType === "CREATOR" ? buildCreator(row) : undefined,
          variables: row.variables ?? {},
        });
        results.push(
          result.ok
            ? { contactEmail: row.contactEmail, status: "sent" }
            : { contactEmail: row.contactEmail, status: "error", detail: result.error }
        );
      } catch (e) {
        results.push({ contactEmail: row.contactEmail, status: "error", detail: e instanceof Error ? e.message : "Unknown error" });
      }
    }
    return NextResponse.json({ results });
  }

  // mode === "attach": search Sent mail for an email the user already sent manually.
  const gmail = await gmailClientFor(emailAccountId);

  for (const row of rows) {
    if (!row.contactEmail) {
      results.push({ contactEmail: "", status: "error", detail: "Missing contact email" });
      continue;
    }
    try {
      const matches = await findSentThreadTo(gmail, row.contactEmail);
      if (matches.length === 0) {
        results.push({
          contactEmail: row.contactEmail,
          status: "no_sent_email_found",
          detail: "No sent email found to this address — send Email 1 first.",
        });
        continue;
      }
      const mostRecent = matches[0];

      const result = await trackSequence({
        outreachType,
        recipientType: row.recipientType,
        emailAccountId,
        threadId: mostRecent.threadId,
        initialMessageId: mostRecent.messageId,
        subject: mostRecent.subject,
        contactEmail: row.contactEmail,
        contactName: row.contactName,
        brand: outreachType === "BRAND" ? buildBrand(row) : undefined,
        creator: outreachType === "CREATOR" ? buildCreator(row) : undefined,
        variables: row.variables ?? {},
      });

      if (!result.ok) {
        results.push({ contactEmail: row.contactEmail, status: "error", detail: result.error });
      } else {
        results.push({
          contactEmail: row.contactEmail,
          status: result.duplicate ? "duplicate" : "tracked",
        });
      }
    } catch (e) {
      results.push({
        contactEmail: row.contactEmail,
        status: "error",
        detail: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ results });
}

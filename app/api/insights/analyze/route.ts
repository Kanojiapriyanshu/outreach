import { NextRequest, NextResponse } from "next/server";
import { createInsightReport } from "@/lib/youtube/insightReport";
import { resolveInsightInput } from "@/lib/youtube/resolveInput";
import { formatYoutubeInsightReport } from "@/lib/youtube/reportDashboard";

// Analysis fans out to a dozen YouTube calls (video, channel, two comment passes, recent uploads)
// plus the AI summary. Measured around 8s on a normal video; the ceiling is headroom for a busy
// one with the full 500 comments.
export const maxDuration = 60;

/** Generates a report for a pasted YouTube video or channel link. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rawInput: string =
    body.videoUrl ?? body.youtubeUrl ?? body.videoLink ?? body.link ?? body.url ?? body.videoId ?? "";

  try {
    const resolved = await resolveInsightInput(rawInput);

    const report = await createInsightReport({
      actor: {},
      payload: {
        videoUrl: resolved.videoUrl,
        originalYoutubeInput: resolved.originalInput,
        resolvedFromProfile: resolved.resolvedFromProfile,
        maxComments: body.maxComments,
        creatorAverageLimit: body.creatorAverageLimit,
        includeReplies: body.includeReplies,
        includeRepliesInAnalysis: body.includeRepliesInAnalysis,
        // Everything generated here is saved — this is an internal tool and the reports list is
        // the point. The engine's public/preview mode exists for the old app's no-login flow.
        saveReport: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: resolved.resolvedFromProfile
        ? `Resolved ${resolved.channelTitle || "that channel"} to its latest video and generated the insight.`
        : "Insight generated.",
      resolvedFromProfile: resolved.resolvedFromProfile,
      data: formatYoutubeInsightReport(report, {}),
    });
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode ?? 500;
    const message = err instanceof Error ? err.message : "Couldn't generate that insight.";
    return NextResponse.json({ success: false, message }, { status });
  }
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ChannelMediaKitView, { type ChannelMediaKitData } from "@/app/media-kit/ChannelMediaKitView";
import CopyShareLinkBar from "./CopyShareLinkBar";

export const dynamic = "force-dynamic";

/** Internal, logged-in preview of a channel media kit — the same document a brand sees via the
 * public link, plus a bar to actually get that link. */
export default async function MediaKitPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mediaKit = await prisma.channelMediaKit.findUnique({ where: { id } });
  if (!mediaKit) notFound();

  return (
    <div className="-my-8 -mx-8">
      <CopyShareLinkBar mediaKitId={id} />
      <ChannelMediaKitView kit={mediaKit.data as unknown as ChannelMediaKitData} />
    </div>
  );
}

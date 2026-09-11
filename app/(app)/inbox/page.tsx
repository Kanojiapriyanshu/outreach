import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import InboxClient from "./InboxClient";

// Reads searchParams, but be explicit anyway: an inbox that renders a build-time snapshot of the
// mailbox would be worse than useless.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export type InboxView = "inbox" | "starred" | "sent" | "archived" | "trash";

const VIEW_FILTERS: Record<InboxView, Prisma.InboxThreadWhereInput> = {
  inbox: { isArchived: false, isTrashed: false },
  starred: { isStarred: true, isTrashed: false },
  sent: { isSent: true, isTrashed: false },
  archived: { isArchived: true, isTrashed: false },
  trash: { isTrashed: true },
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; thread?: string; page?: string }>;
}) {
  const params = await searchParams;
  const view: InboxView = (["inbox", "starred", "sent", "archived", "trash"] as const).includes(
    params.view as InboxView
  )
    ? (params.view as InboxView)
    : "inbox";
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.InboxThreadWhereInput = {
    ...VIEW_FILTERS[view],
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" } },
            { snippet: { contains: q, mode: "insensitive" } },
            { fromName: { contains: q, mode: "insensitive" } },
            { fromAddress: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [threads, total, unreadCount, accountCount, syncedAccount] = await Promise.all([
    prisma.inboxThread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        sequence: {
          select: { id: true, stage: true, status: true, outreachType: true },
        },
      },
    }),
    prisma.inboxThread.count({ where }),
    prisma.inboxThread.count({ where: { isArchived: false, isTrashed: false, isUnread: true } }),
    prisma.emailAccount.count({ where: { accessStatus: "CONNECTED" } }),
    prisma.emailAccount.findFirst({
      where: { accessStatus: "CONNECTED" },
      select: { inboxSyncedAt: true, email: true, grantedScopes: true },
    }),
  ]);

  // Accounts connected before gmail.modify was requested can read and send but not relabel, so
  // archiving/starring/marking read here won't reach the real mailbox until they reconnect once.
  const twoWaySync = (syncedAccount?.grantedScopes ?? "").includes("gmail.modify");

  return (
    <InboxClient
      view={view}
      q={q}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      unreadCount={unreadCount}
      hasAccount={accountCount > 0}
      twoWaySync={twoWaySync}
      lastSyncedAt={syncedAccount?.inboxSyncedAt?.toISOString() ?? null}
      accountEmail={syncedAccount?.email ?? null}
      openThreadId={params.thread ?? null}
      threads={threads.map((t) => ({
        id: t.id,
        subject: t.subject,
        snippet: t.snippet,
        fromName: t.fromName,
        fromAddress: t.fromAddress,
        lastMessageAt: t.lastMessageAt.toISOString(),
        messageCount: t.messageCount,
        isUnread: t.isUnread,
        isStarred: t.isStarred,
        isArchived: t.isArchived,
        isTrashed: t.isTrashed,
        sequence: t.sequence
          ? { id: t.sequence.id, stage: t.sequence.stage, status: t.sequence.status, outreachType: t.sequence.outreachType }
          : null,
      }))}
    />
  );
}

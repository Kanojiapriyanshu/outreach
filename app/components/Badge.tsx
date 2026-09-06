const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  REPLIED: { bg: "var(--success-bg)", fg: "var(--success-fg)" },
  COMPLETED: { bg: "var(--neutral-bg)", fg: "var(--neutral-fg)" },
  BOUNCED: { bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
  UNSUBSCRIBED: { bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
  STOPPED: { bg: "var(--neutral-bg)", fg: "var(--neutral-fg)" },
  PAUSED: { bg: "var(--warn-bg)", fg: "var(--warn-fg)" },
  CONNECTED: { bg: "var(--success-bg)", fg: "var(--success-fg)" },
  NEEDS_REAUTH: { bg: "var(--warn-bg)", fg: "var(--warn-fg)" },
  DISCONNECTED: { bg: "var(--neutral-bg)", fg: "var(--neutral-fg)" },
  DEFAULT: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
};

// Plain-language labels — no one outside the team should have to decode a database enum.
const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  INITIAL_EMAIL_DETECTED: "Email found",
  WAITING_FOR_REPLY: "Waiting for reply",
  FOLLOW_UP_1_SENT: "Follow-up #1 sent",
  FOLLOW_UP_2_SENT: "Follow-up #2 sent",
  FOLLOW_UP_3_SENT: "Follow-up #3 sent",
  REPLIED: "Replied",
  BOUNCED: "Bounced",
  UNSUBSCRIBED: "Opted out",
  STOPPED: "Stopped",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CONNECTED: "Connected",
  NEEDS_REAUTH: "Needs reconnecting",
  DISCONNECTED: "Not connected",
};

export function statusLabel(status: string): string {
  return (
    STATUS_LABEL[status] ??
    status
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ")
  );
}

export default function Badge({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.DEFAULT;
  return (
    <span className="badge" style={{ background: style.bg, color: style.fg }}>
      {label ?? statusLabel(status)}
    </span>
  );
}

// Pipeline stage — the business/tracking-sheet label, separate from the automation status above.
// Colors come from CSS variables (globals.css) so they adapt automatically between light and dark.
const STAGE_STYLE: Record<string, { bg: string; fg: string }> = {
  FIRST_EMAIL_SENT: { bg: "var(--stage-first-bg)", fg: "var(--stage-first-fg)" },
  CREATOR_LIST_REQUESTED: { bg: "var(--stage-creatorlist-bg)", fg: "var(--stage-creatorlist-fg)" },
  CREATOR_LIST_SENT: { bg: "var(--stage-creatorlist-bg)", fg: "var(--stage-creatorlist-fg)" },
  NEGOTIATION: { bg: "var(--stage-negotiation-bg)", fg: "var(--stage-negotiation-fg)" },
  CREATOR_SELECTED: { bg: "var(--stage-creatorselected-bg)", fg: "var(--stage-creatorselected-fg)" },
  NOT_INTERESTED: { bg: "var(--stage-notinterested-bg)", fg: "var(--stage-notinterested-fg)" },
  DEAL: { bg: "var(--stage-deal-bg)", fg: "var(--stage-deal-fg)" },
};

const STAGE_LABEL: Record<string, string> = {
  FIRST_EMAIL_SENT: "First Email Sent",
  CREATOR_LIST_REQUESTED: "Creator List Requested",
  CREATOR_LIST_SENT: "Creator List Sent",
  NEGOTIATION: "Negotiation",
  CREATOR_SELECTED: "Creator Selected",
  NOT_INTERESTED: "Not Interested",
  DEAL: "Deal",
};

export function stageLabelText(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

export function StageBadge({ stage }: { stage: string }) {
  const style = STAGE_STYLE[stage] ?? STATUS_STYLE.DEFAULT;
  return (
    <span className="badge" style={{ background: style.bg, color: style.fg }}>
      {stageLabelText(stage)}
    </span>
  );
}

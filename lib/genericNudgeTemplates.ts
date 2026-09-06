const SIGNATURE = `Yash\nGrowth Lead | Fidem Growth\nyash@fidemgrowth.com | fidemgrowth.com`;

function fill(body: string, contactName: string): string {
  return body.replace(/\{Contact_Name\}/g, contactName);
}

/**
 * Sent after the team hand-types a message directly into Gmail (typically the creator shortlist)
 * and the brand hasn't replied yet. Asks specifically about the list and offers to negotiate
 * budget on their behalf — not a generic "just bumping this" nudge.
 */
const CREATOR_LIST_NUDGE_TEMPLATES: { step: number; body: string }[] = [
  {
    step: 1,
    body: `Hi {Contact_Name},

Just checking in — have you had a chance to take a look at the creator list I sent over?

Happy to answer any questions or send over more options if none of them feel like the right fit.

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 2,
    body: `Hi {Contact_Name},

Following up again on the creator list — wanted to check if there's any update on your end, or if anything's holding things up.

If budget is a factor, we're happy to negotiate rates on your behalf to help make a creator work for you.

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 3,
    body: `Hi {Contact_Name},

Last check-in from me on the creator list — I don't want to keep bumping this.

If the timing isn't right, no worries at all. Feel free to reach back out whenever it makes sense, or let me know if there's anything I can adjust to help move this forward.

Best regards,
${SIGNATURE}`,
  },
];

/**
 * Sent after a non-committal reply ("ok, will check and get back to you") — asks specifically
 * whether they've had a chance to check internally with their team/manager, rather than a
 * generic bump.
 */
const TEAM_CHECK_NUDGE_TEMPLATES: { step: number; body: string }[] = [
  {
    step: 1,
    body: `Hi {Contact_Name},

Just following up — have you had a chance to check with your team on this?

Let me know if you need anything else from my side to help move it along.

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 2,
    body: `Hi {Contact_Name},

Checking back in — any update after connecting with your team?

Happy to jump on a quick call if that's easier than email back-and-forth.

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 3,
    body: `Hi {Contact_Name},

Last note from me here — if the timing isn't right internally, that's completely understandable.

Feel free to reach back out whenever it makes sense on your end.

Best regards,
${SIGNATURE}`,
  },
];

/** Generic fallback for a manual send that doesn't fit either case above. */
const GENERIC_NUDGE_TEMPLATES: { step: number; body: string }[] = [
  {
    step: 1,
    body: `Hi {Contact_Name},

Just floating this back to the top of your inbox in case it slipped by.

Let me know if you have any thoughts or questions — happy to jump on a quick call too if that's easier.

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 2,
    body: `Hi {Contact_Name},

Following up once more on this — no pressure, just want to make sure it didn't get buried in a busy inbox.

Let me know either way, even a quick note helps me plan on our end.

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 3,
    body: `Hi {Contact_Name},

Last bump from me on this one — I don't want to keep filling your inbox.

If the timing isn't right, no worries at all. Feel free to reach back out whenever it makes sense, or just reply "not now" and I'll leave it there for now.

Best regards,
${SIGNATURE}`,
  },
];

const TEMPLATE_SETS = {
  CREATOR_LIST_NUDGE: CREATOR_LIST_NUDGE_TEMPLATES,
  TEAM_CHECK_NUDGE: TEAM_CHECK_NUDGE_TEMPLATES,
  GENERIC_NUDGE: GENERIC_NUDGE_TEMPLATES,
} as const;

export type NudgeKind = keyof typeof TEMPLATE_SETS;

export function renderNudge(kind: NudgeKind, step: number, contactName: string): string {
  const set = TEMPLATE_SETS[kind] ?? GENERIC_NUDGE_TEMPLATES;
  const template = set.find((t) => t.step === step) ?? set[set.length - 1];
  return fill(template.body, contactName);
}

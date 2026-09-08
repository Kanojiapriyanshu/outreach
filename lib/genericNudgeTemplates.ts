// No hardcoded name/title/contact block — Gmail already appends the sender's own signature
// below the compose box on send, so baking one into the nudge text just duplicates it.

import { renderTemplate } from "@/lib/templates";

/**
 * Sent after the team hand-types a message directly into Gmail (typically the creator shortlist)
 * and the brand hasn't replied yet. Steps 1-3 ask specifically about the list and offer to
 * negotiate budget on their behalf — not a generic "just bumping this" nudge. Step 4 only fires
 * if there's still been no reply after 3 nudges: a final, no-pressure close-out (not a 4th ask)
 * that leaves the door open instead of just going silent.
 */
const CREATOR_LIST_NUDGE_TEMPLATES: { step: number; body: string }[] = [
  {
    step: 1,
    body: `Hi {Contact_Name},

Hope you're having a great week!

Just following up to see if you've had a chance to review the creator shortlist we sent over for the {Brand_Or_Campaign_Name}?

As a quick reminder, if you feel any of the creators are a great fit but budget becomes an obstacle, do let us know — we can discuss and negotiate on your behalf to get the pricing closer to your proposal and get things moving.

Let me know if any stand out to your team or if you'd like us to adjust the selection!

Thanks & Regards,`,
  },
  {
    step: 2,
    body: `Hi {Contact_Name},

Hope you're having a great week!

Just following up on this to see if there are any updates on your end regarding the creator shortlist for the {Brand_Or_Campaign_Name}?

If you need any assistance selecting creators, reviewing profile metrics, or adjusting the selection to better align with your campaign goals, please let me know — I'd be more than happy to help!

Looking forward to hearing your thoughts.`,
  },
  {
    step: 3,
    body: `Hi {Contact_Name},

Hope you're having a great weekend!

Just doing a quick check-in to see if your team has had a chance to review the creator shortlist for the {Brand_Or_Campaign_Name}.

If any creators caught your eye or if you need us to adjust for specific targets, custom deliverables, or price negotiations — let me know so we can lock them in.

Looking forward to hearing your thoughts!

Thanks & Regards,`,
  },
  {
    step: 4,
    body: `Hi {Contact_Name},

I don't want to keep this sitting in your inbox, so I'll leave it here for now — no more check-ins from my side on the {Brand_Or_Campaign_Name} shortlist unless you'd like one.

If any of the creators we sent are still worth a look, or you'd like a fresh set to match a different budget, timeline, or angle, just reply here and we'll pick it straight back up. And if it's simply not the right time, that's completely fine too — we're always happy to help whenever a new campaign or creator need comes up.

Thanks again for considering us, and talk soon,`,
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

Thanks & Regards,`,
  },
  {
    step: 2,
    body: `Hi {Contact_Name},

Checking back in — any update after connecting with your team?

Happy to jump on a quick call if that's easier than email back-and-forth.

Thanks & Regards,`,
  },
  {
    step: 3,
    body: `Hi {Contact_Name},

Last note from me here — if the timing isn't right internally, that's completely understandable.

Feel free to reach back out whenever it makes sense on your end.

Best regards,`,
  },
];

/** Generic fallback for a manual send that doesn't fit either case above. */
const GENERIC_NUDGE_TEMPLATES: { step: number; body: string }[] = [
  {
    step: 1,
    body: `Hi {Contact_Name},

Just floating this back to the top of your inbox in case it slipped by.

Let me know if you have any thoughts or questions — happy to jump on a quick call too if that's easier.

Thanks & Regards,`,
  },
  {
    step: 2,
    body: `Hi {Contact_Name},

Following up once more on this — no pressure, just want to make sure it didn't get buried in a busy inbox.

Let me know either way, even a quick note helps me plan on our end.

Thanks & Regards,`,
  },
  {
    step: 3,
    body: `Hi {Contact_Name},

Last bump from me on this one — I don't want to keep filling your inbox.

If the timing isn't right, no worries at all. Feel free to reach back out whenever it makes sense, or just reply "not now" and I'll leave it there for now.

Best regards,`,
  },
];

const TEMPLATE_SETS = {
  CREATOR_LIST_NUDGE: CREATOR_LIST_NUDGE_TEMPLATES,
  TEAM_CHECK_NUDGE: TEAM_CHECK_NUDGE_TEMPLATES,
  GENERIC_NUDGE: GENERIC_NUDGE_TEMPLATES,
} as const;

export type NudgeKind = keyof typeof TEMPLATE_SETS;

/** Only CREATOR_LIST_NUDGE has a 4th, final close-out step — the others stop at 3. */
export function maxStepsForNudge(kind: NudgeKind): number {
  return kind === "CREATOR_LIST_NUDGE" ? 4 : 3;
}

export function renderNudge(kind: NudgeKind, step: number, variables: Record<string, string>): string {
  const set = TEMPLATE_SETS[kind] ?? GENERIC_NUDGE_TEMPLATES;
  const template = set.find((t) => t.step === step) ?? set[set.length - 1];
  return renderTemplate(template.body, variables);
}

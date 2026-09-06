const SIGNATURE = `Yash\nGrowth Lead | Fidem Growth\nyash@fidemgrowth.com | fidemgrowth.com`;

export interface DefaultTemplate {
  step: number;
  name: string;
  subject: string;
  body: string;
}

export const brandTemplates: DefaultTemplate[] = [
  {
    step: 1,
    name: "Brand Email 1",
    subject: "{Brand_Or_Campaign_Name} × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine",
    body: `Hello {Contact_Name},

This is Yash from Fidem Growth. {Brand_Or_Campaign_Name}'s {Key_Product_Features} feels built for exactly the kind of hands-on testing and review content that converts on YouTube right now, especially for an audience actively comparing {Target_Audience_Or_Angle}.

We work with pre-vetted US {Niche_Categories} creators (10K–500K subscribers) who turn hands-on reviews into real sales, without the back-and-forth of vetting and negotiating creators yourself. We handle sourcing, outreach, shipping, and compliance end to end.

For each creator, we can share a full media kit detailing audience demographics. Once a campaign goes live, you'll get real-time performance tracking so you can see exactly how it's converting rather than waiting for a final report.

Shall I send over a few creators, audience stats with full media kits, and rates for your team to review?

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 2,
    name: "Brand Follow-Up 1",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine",
    body: `Hello {Contact_Name},

I'm following up on our last email to ensure it didn't get lost.

I wanted to check if {Brand_Or_Campaign_Name} would like to move forward with this.

We have a solid group of US {Niche_Categories} creators ready for next month's integrations. I'd love to send over their profiles, audience stats, media kits, and rates if you're interested.

Also, if you're running any other campaigns alongside {Brand_Or_Campaign_Name}, feel free to send over the briefs—we have a broad pool of creators across various categories, regions, and tiers ready to go.

Let me know if this is a yes for now or if the timing isn't right; either way, I appreciate a quick reply!

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 3,
    name: "Brand Follow-Up 2",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine",
    body: `Hi {Contact_Name},

Quick bump on this in case it slipped under a busy inbox.

We're locking in creator slots for next month's campaign schedules now. If budget or timeline is currently a bottleneck for {Brand_Or_Campaign_Name}, we're always happy to negotiate rates or structure flexible package options to make a test run work for your team.

Should I send over a quick shortlist of available creators and rates for you to take a look?

Best regards,
${SIGNATURE}`,
  },
  {
    step: 4,
    name: "Brand Follow-Up 3",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine",
    body: `Hi {Contact_Name},

I know timing isn't always right for a new campaign rollout, so I'll stop filling your inbox for now.

If you ever need pre-vetted US creators in the {Niche_Categories} space down the line, feel free to pull up this thread or drop me a line anytime.

Wishing you and the {Brand_Or_Campaign_Name} team the best with your upcoming launches!

Best regards,
${SIGNATURE}`,
  },
];

export const brandAgencyTemplates: DefaultTemplate[] = [
  {
    step: 1,
    name: "Brand Email 1 (Agency)",
    subject: "{Brand_Or_Campaign_Name} × Fidem Growth — Creator Partnerships, Agency to Agency",
    body: `Hello {Contact_Name},

This is Yash from Fidem Growth. I saw you're leading the {Brand_Or_Campaign_Name} campaign on the agency side, so I figured it made more sense to reach out agency-to-agency rather than send a single-creator pitch.

Right now, we have a strong pool of pre-vetted US {Niche_Categories} reviewers available for collaborations, ranging from 10K+ to 500K+ subscribers. They are a great fit for demonstrating {Brand_Or_Campaign_Name}'s {Key_Product_Features} through dedicated reviews or integrated segments.

For each creator, we can share a full media kit with US audience demographics, platform analytics, relevant content examples, and rates. Once a campaign goes live, you'll also get real-time performance tracking so you can see exactly how it's converting rather than waiting on a final report.

We handle everything end-to-end—sourcing, vetting, rate negotiation, product shipping, and campaign compliance—making it easy to scale creator volume without extra operational lift for your team.

Would it be worth me sending over a curated shortlist with audience breakdowns, past performance stats, and rates for your team to review for {Brand_Or_Campaign_Name}?

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 2,
    name: "Brand Follow-Up 1 (Agency)",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Creator Partnerships, Agency to Agency",
    body: `Hi {Contact_Name},

Following up agency-to-agency on {Brand_Or_Campaign_Name} in case this got buried.

We've still got a strong shortlist of US {Niche_Categories} creators (10K+ to 500K+ subscribers) ready for next month's integrations, and I'd love to send over their audience breakdowns, media kits, and rates for your team to review.

If you're also running other campaigns alongside {Brand_Or_Campaign_Name}, happy to see if we have creators that fit those too — we work across a broad range of categories and tiers.

Let me know either way, even a quick "not now" helps me plan on our end.

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 3,
    name: "Brand Follow-Up 2 (Agency)",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Creator Partnerships, Agency to Agency",
    body: `Hi {Contact_Name},

Quick bump on {Brand_Or_Campaign_Name} in case it slipped down the inbox.

We're finalizing creator slots for next month's schedule now. If budget or timing is the holdup on your end, we're flexible on rates and package structure to get a first test campaign moving.

Want me to send a short list of available {Niche_Categories} creators and rates to look over?

Best regards,
${SIGNATURE}`,
  },
  {
    step: 4,
    name: "Brand Follow-Up 3 (Agency)",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Creator Partnerships, Agency to Agency",
    body: `Hi {Contact_Name},

Sounds like the timing isn't right on {Brand_Or_Campaign_Name} for now, so I'll stop bumping this thread.

If you or your roster ever need pre-vetted US {Niche_Categories} creators for a future campaign, feel free to reopen this thread or reach out directly anytime.

Wishing your team a strong run with the {Brand_Or_Campaign_Name} launch!

Best regards,
${SIGNATURE}`,
  },
];

export const creatorTemplates: DefaultTemplate[] = [
  {
    step: 1,
    name: "Creator Email 1",
    subject: "Fidem Growth × {Creator_Name} — Paid Collaboration Opportunity",
    body: `Hi {Creator_Name},

This is Yash from Fidem Growth — we work with creators on paid brand partnerships.

We're currently working with a {Niche_Or_Product_Category} brand looking to sponsor a {Deliverable_Type} video, and your channel's honest, hands-on style caught our eye. It's a paid collaboration — we handle the brand details, product shipping, and payment on our end once we align.

If you're open to it, just reply with your rate for a {Deliverable_Type} video and we can move fast from there.

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 2,
    name: "Creator Follow-Up 1",
    subject: "Re: Fidem Growth × {Creator_Name} — Paid Collaboration Opportunity",
    body: `Hi {Creator_Name},

I know inboxes get busy, so I'll keep this short.

We still have a spot open on the shortlist for this {Niche_Or_Product_Category} review campaign, and I'd love to include you if it's a fit. If now isn't the right time, no worries at all — just a quick "not interested" helps me know to move forward with the rest of the list.

If you are open to it, even a rough rate for a {Deliverable_Type} would be great to get the conversation going.

Either way, thanks for your time — appreciate you!

Best Regards,
${SIGNATURE}`,
  },
  {
    step: 3,
    name: "Creator Follow-Up 2",
    subject: "Re: Fidem Growth × {Creator_Name} — Paid Collaboration Opportunity",
    body: `Hi {Creator_Name},

Just following up on my last note to make sure it didn't get lost in your inbox.

We're closing out the creator shortlist for this campaign soon. If you're able to send over your rate for a {Deliverable_Type}, we can try to lock in your spot right away. If timing isn't right, just a quick "not interested" is all we need so we can move forward.

Either way, thanks for your time!

Thanks & Regards,
${SIGNATURE}`,
  },
  {
    step: 4,
    name: "Creator Follow-Up 3",
    subject: "Re: Fidem Growth × {Creator_Name} — Paid Collaboration Opportunity",
    body: `Hi {Creator_Name},

Assuming you're pass-through or fully booked on sponsorships right now, so I'll stop bumping this thread.

We work on a lot of upcoming {Niche_Or_Product_Category} launches throughout the year. Whenever your schedule opens up or you want to see what paid campaigns we have running, feel free to drop me a line anytime.

Keep up the great content!

Best regards,
${SIGNATURE}`,
  },
];

// No hardcoded name/title/contact block — Gmail already appends the sender's own signature
// below the compose box on send, so baking one into the template text just duplicates it.
// Bodies end on the sign-off line itself ("Thanks & Regards," / "Best regards,").

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

Thanks & Regards,`,
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

Thanks & Regards,`,
  },
  {
    step: 3,
    name: "Brand Follow-Up 2",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine",
    body: `Hi {Contact_Name},

Quick bump on this in case it slipped under a busy inbox.

We're locking in creator slots for next month's campaign schedules now. If budget or timeline is currently a bottleneck for {Brand_Or_Campaign_Name}, we're always happy to negotiate rates or structure flexible package options to make a test run work for your team.

Should I send over a quick shortlist of available creators and rates for you to take a look?

Best regards,`,
  },
  {
    step: 4,
    name: "Brand Follow-Up 3",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine",
    body: `Hi {Contact_Name},

I know timing isn't always right for a new campaign rollout, so I'll stop filling your inbox for now.

If you ever need pre-vetted US creators in the {Niche_Categories} space down the line, feel free to pull up this thread or drop me a line anytime.

Wishing you and the {Brand_Or_Campaign_Name} team the best with your upcoming launches!

Best regards,`,
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

Thanks & Regards,`,
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

Thanks & Regards,`,
  },
  {
    step: 3,
    name: "Brand Follow-Up 2 (Agency)",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Creator Partnerships, Agency to Agency",
    body: `Hi {Contact_Name},

Quick bump on {Brand_Or_Campaign_Name} in case it slipped down the inbox.

We're finalizing creator slots for next month's schedule now. If budget or timing is the holdup on your end, we're flexible on rates and package structure to get a first test campaign moving.

Want me to send a short list of available {Niche_Categories} creators and rates to look over?

Best regards,`,
  },
  {
    step: 4,
    name: "Brand Follow-Up 3 (Agency)",
    subject: "Re: {Brand_Or_Campaign_Name} × Fidem Growth — Creator Partnerships, Agency to Agency",
    body: `Hi {Contact_Name},

Sounds like the timing isn't right on {Brand_Or_Campaign_Name} for now, so I'll stop bumping this thread.

If you or your roster ever need pre-vetted US {Niche_Categories} creators for a future campaign, feel free to reopen this thread or reach out directly anytime.

Wishing your team a strong run with the {Brand_Or_Campaign_Name} launch!

Best regards,`,
  },
];

// Email 1 is the team's own influencer pitch, word for word. The campaign-specific phrases in it
// are variables so the same copy works for every creator and campaign:
//   {Content_Highlights}         "midlife lifestyle, home styling, and affordable upgrade content"
//   {Niche_Or_Product_Category}  "home furniture/living"
//   {Deliverable_Type}           "dedicated sofa review"
// The follow-ups are written from that draft: same voice, same single ask (their rate for a
// dedicated video), and the same "rate first, brand details after" order.
export const creatorTemplates: DefaultTemplate[] = [
  {
    step: 1,
    name: "Creator Email 1",
    subject: "Fidem Growth × {Creator_Name} — Paid Collaboration Opportunity",
    body: `Hello,

This is Yash from Fidem Growth — we work with US-based creators on paid brand collaborations.

I've been following your content, and it's exactly the authentic, relatable style — your {Content_Highlights} — that resonates with a brand we're currently working with in the {Niche_Or_Product_Category} space. We're putting together a shortlist for a {Deliverable_Type}, and your channel stood out as a strong fit given your engaged audience and content style.

Before sharing further brand details, I wanted to check: would you be open to a paid collaboration? If so, could you share your rate for a dedicated video, so we can see what aligns with the campaign budget?

Once we align on rate, I'll share full brand details, product info, and next steps.

Looking forward to hearing from you.

Thanks & Regards,`,
  },
  {
    step: 2,
    name: "Creator Follow-Up 1",
    subject: "Re: Fidem Growth × {Creator_Name} — Paid Collaboration Opportunity",
    body: `Hello,

Just following up on my note below in case it got buried. We're still putting together the shortlist for the {Deliverable_Type} with a brand in the {Niche_Or_Product_Category} space, and your channel is one we'd really like to include.

It's a paid collaboration. If you're open to it, could you share your rate for a dedicated video? Once we align on rate, I'll send over the full brand details, product info, and next steps.

Looking forward to hearing from you.

Thanks & Regards,`,
  },
  {
    step: 3,
    name: "Creator Follow-Up 2",
    subject: "Re: Fidem Growth × {Creator_Name} — Paid Collaboration Opportunity",
    body: `Hello,

Quick bump on this — we're finalizing the creator shortlist for this campaign soon, and I'd love to have your channel on it.

If you can share your rate for a dedicated video, even a ballpark, I'll check it against the campaign budget right away and come back to you with the brand details. And if paid collaborations aren't something you're taking on right now, a quick "not interested" is completely fine — it just helps me plan on our end.

Thanks & Regards,`,
  },
  {
    step: 4,
    name: "Creator Follow-Up 3",
    subject: "Re: Fidem Growth × {Creator_Name} — Paid Collaboration Opportunity",
    body: `Hello,

I don't want to keep filling your inbox, so this will be my last note on this one.

If you'd still like to be considered for this {Deliverable_Type}, or for future paid collaborations with the brands we work with, just reply with your rate for a dedicated video and I'll pick it straight back up.

Wishing you all the best with your channel!

Best regards,`,
  },
];

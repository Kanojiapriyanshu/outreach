import { WorkspaceTabs } from "@/app/components/ui";

/** Switches between the outreach tracker (threads), the creator roster (people) and the public
 * roster page shared with brands. Pitch sheets live in the Brands workspace — they're what a brand
 * receives. */
export default function InfluencerTabs({ active, counts = {} }: { active: "outreach" | "creators" | "roster"; counts?: { outreach?: number } }) {
  return (
    <WorkspaceTabs
      active={active}
      tabs={[
        { key: "outreach", href: "/influencers", label: "Outreach", count: counts.outreach },
        { key: "creators", href: "/influencers/creators", label: "Creators" },
        { key: "roster", href: "/influencers/roster", label: "Public roster" },
      ]}
    />
  );
}

import { WorkspaceTabs } from "@/app/components/ui";

/** Switches between the brand workspace's three views: the outreach tracker, the creator
 * shortlists sent to brands, and brand contracts. */
export default function BrandTabs({ active, counts = {} }: { active: "outreach" | "pitch-sheets" | "contracts"; counts?: { outreach?: number } }) {
  return (
    <WorkspaceTabs
      active={active}
      tabs={[
        { key: "outreach", href: "/brands", label: "Outreach", count: counts.outreach },
        { key: "pitch-sheets", href: "/brands/pitch-sheets", label: "Pitch sheets" },
        { key: "contracts", href: "/contracts", label: "Contracts" },
      ]}
    />
  );
}

import Link from "next/link";

const TABS = [
  { key: "outreach", href: "/influencers", label: "Outreach" },
  { key: "creators", href: "/influencers/creators", label: "Creators" },
] as const;

/** Switches between the outreach tracker (threads) and the creator roster (people). */
export default function InfluencerTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex gap-1 p-1 rounded-full w-fit" style={{ background: "var(--neutral-bg)" }}>
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className="px-4 py-1.5 text-sm font-medium rounded-full transition-colors"
          style={{
            background: tab.key === active ? "var(--surface)" : "transparent",
            color: tab.key === active ? "var(--ink)" : "var(--muted)",
            boxShadow: tab.key === active ? "var(--shadow-card)" : "none",
          }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

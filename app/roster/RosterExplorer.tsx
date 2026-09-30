"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import type { PublicRosterCreator } from "@/lib/publicRoster";
import { slugTag } from "@/lib/publicRosterRules";
import PlatformIcon from "./PlatformIcon";

type Sort = "reach" | "views" | "engagement" | "name";

const SORTS: { key: Sort; label: string }[] = [
  { key: "reach", label: "Subscribers" },
  { key: "views", label: "Views per video" },
  { key: "engagement", label: "Engagement" },
  { key: "name", label: "Name" },
];

function compact(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

/**
 * The talent grid: search, sort, niche filter, and one card per creator. Filtering happens in the
 * browser — the roster is at most a few hundred creators — and the chosen niche is kept in the URL
 * (?niche=tech), so the team can send a brand a link that opens straight onto the creators that fit.
 */
export default function RosterExplorer({ creators, niches }: { creators: PublicRosterCreator[]; niches: { tag: string; slug: string; count: number }[] }) {
  const [niche, setNiche] = useState<string>("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("reach");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("niche");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable after mount
    if (fromUrl) setNiche(fromUrl);
  }, []);

  function pickNiche(slug: string) {
    setNiche(slug);
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("niche", slug);
    else url.searchParams.delete("niche");
    window.history.replaceState(null, "", url);
  }

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = creators.filter((c) => {
      if (niche && !c.niches.some((t) => slugTag(t) === niche)) return false;
      if (!term) return true;
      return [c.name, c.handle, c.focus, ...c.niches].some((v) => v?.toLowerCase().includes(term));
    });
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    const key = (c: PublicRosterCreator) => (sort === "engagement" ? c.engagementRate : sort === "views" ? c.averageViews : c.subscriberCount) ?? -1;
    return [...list].sort((a, b) => key(b) - key(a));
  }, [creators, niche, q, sort]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-4">
          <h2 className="shrink-0 text-lg font-semibold">Our talent</h2>
          <div className="relative w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search anyone on our roster"
              aria-label="Search creators"
              className="w-full rounded-full border border-white/5 bg-white/[0.06] py-2 pl-9 pr-4 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-[#2aa7b8]/60 focus:bg-white/[0.08]"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/60">
          <ArrowUpDown size={14} /> Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-lg border border-white/5 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none"
            aria-label="Sort creators"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key} className="bg-[#10131d]">
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {niches.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by niche">
          <Chip active={!niche} onClick={() => pickNiche("")} label="All" count={creators.length} />
          {niches.map((n) => (
            <Chip key={n.slug} active={niche === n.slug} onClick={() => pickNiche(niche === n.slug ? "" : n.slug)} label={n.tag} count={n.count} />
          ))}
        </div>
      )}

      {creators.length === 0 ? (
        <Empty text="Our roster is being refreshed — request a shortlist and we'll send creators that fit your brand." />
      ) : shown.length === 0 ? (
        <Empty text="No one on the roster matches that — try another niche or name." />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((c) => (
            <TalentCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center text-sm text-white/50">{text}</div>;
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
        active ? "bg-white text-[#0a0b12]" : "bg-white/[0.06] text-white/70 hover:bg-white/10"
      }`}
    >
      {label}
      <span className={active ? "text-[#0a0b12]/50" : "text-white/35"}>{count}</span>
    </button>
  );
}

function TalentCard({ c }: { c: PublicRosterCreator }) {
  const href = c.mediaKitUrl ?? c.channelUrl;
  const card = (
    <>
      {c.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar
        <img src={c.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-28 w-28 rounded-full object-cover" />
      ) : (
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#157a8c] to-[#2aa7b8] text-3xl font-semibold">
          {c.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <h3 className="mt-4 w-full truncate px-2 text-[15px] font-semibold">{c.name}</h3>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] font-medium text-white/80">
        <span className="inline-flex items-center gap-1" title="YouTube subscribers">
          <PlatformIcon platform="youtube" /> {compact(c.subscriberCount)}
        </span>
        {c.averageViews !== null && (
          <span className="text-white/55" title="Average views per video">
            {compact(c.averageViews)} avg views
          </span>
        )}
        {c.engagementRate !== null && (
          <span className="text-white/55" title="Engagement rate">
            {c.engagementRate.toFixed(1)}% eng.
          </span>
        )}
      </div>
      {c.platforms.length > 0 && (
        <div className="mt-2 flex items-center justify-center gap-2.5 text-white/55">
          {c.platforms.map((p) => (
            <span key={p.key} title={`Also on ${p.label}`}>
              <PlatformIcon platform={p.key} />
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {(c.niches.length ? c.niches.slice(0, 2) : ["Creator"]).map((t) => (
          <span key={t} className="rounded-full bg-[#2aa7b8]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#7ee8d8]">
            {t}
          </span>
        ))}
      </div>
      {href && (
        <span className="absolute inset-x-0 bottom-0 translate-y-full bg-[#2aa7b8] py-1.5 text-center text-[11px] font-semibold text-white transition-transform duration-200 group-hover:translate-y-0 group-focus-visible:translate-y-0">
          {c.mediaKitUrl ? "Open media kit" : "Open YouTube channel"}
        </span>
      )}
    </>
  );
  const className =
    "group relative flex flex-col items-center overflow-hidden rounded-2xl border border-white/5 bg-white/[0.035] px-4 pb-7 pt-6 text-center transition hover:border-white/10 hover:bg-white/[0.06]";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={`${c.name} — ${c.mediaKitUrl ? "open media kit" : "open YouTube channel"}`}>
      {card}
    </a>
  ) : (
    <div className={className}>{card}</div>
  );
}

import { redirect } from "next/navigation";

/**
 * The old mixed Pipeline list. Brands and creators now each have their own workspace, so a
 * bookmarked /pipeline link lands on the matching one — creators when it was filtered to creators,
 * brands otherwise — carrying the search along.
 */
export default async function PipelineRedirect({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; starred?: string }> }) {
  const { tab, q, starred } = await searchParams;
  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(starred === "1" && tab !== "creators" ? { view: "starred" } : {}) });
  const query = params.size ? `?${params.toString()}` : "";
  redirect(tab === "creators" ? `/influencers${query}` : `/brands${query}`);
}

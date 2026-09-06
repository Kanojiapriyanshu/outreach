import { prisma } from "@/lib/prisma";

async function metricsFor(outreachType: "BRAND" | "CREATOR") {
  const sequences = await prisma.outreachSequence.findMany({ where: { outreachType } });
  const total = sequences.length;
  const replied = sequences.filter((s) => s.status === "REPLIED").length;
  const completed = sequences.filter((s) => s.status === "COMPLETED").length;
  const bounced = sequences.filter((s) => s.status === "BOUNCED").length;
  const repliedSeqs = sequences.filter((s) => s.status === "REPLIED");

  return {
    total,
    replied,
    replyRate: total > 0 ? ((replied / total) * 100).toFixed(1) : "0.0",
    followUp1Replies: repliedSeqs.filter((s) => s.currentStep === 1).length,
    followUp2Replies: repliedSeqs.filter((s) => s.currentStep === 2).length,
    followUp3Replies: repliedSeqs.filter((s) => s.currentStep === 3).length,
    completed,
    bounced,
  };
}

export default async function AnalyticsPage() {
  const [brand, creator] = await Promise.all([metricsFor("BRAND"), metricsFor("CREATOR")]);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">How It&apos;s Going</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">Brands and creators are counted separately below.</p>
      </div>
      <MetricsGroup title="Brands" m={brand} />
      <MetricsGroup title="Creators" m={creator} />
    </div>
  );
}

function MetricsGroup({
  title,
  m,
}: {
  title: string;
  m: Awaited<ReturnType<typeof metricsFor>>;
}) {
  const cells: [string, string | number][] = [
    ["Total Contacted", m.total],
    ["Replied", m.replied],
    ["Reply Rate", `${m.replyRate}%`],
    ["Replied After 1st Follow-Up", m.followUp1Replies],
    ["Replied After 2nd Follow-Up", m.followUp2Replies],
    ["Replied After 3rd Follow-Up", m.followUp3Replies],
    ["Finished, No Reply", m.completed],
    ["Bounced (Bad Email)", m.bounced],
  ];
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-[15px] text-[var(--ink)]">{title}</h2>
      <div className="grid grid-cols-4 gap-3">
        {cells.map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-xl font-semibold text-[var(--ink)] tracking-tight">{value}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

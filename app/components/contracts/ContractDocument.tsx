import Logo from "@/app/components/Logo";
import type { BuiltContract } from "@/lib/contracts/template";
import type { RowDiff, Segment, SectionDiff } from "@/lib/contracts/diff";

// The Fidem "F" as a faded tile, one per letter-size page of height, for the on-screen preview. In
// print the fixed .contract-watermark element does this instead, centred on every page.
const WATERMARK_TILE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="1056" viewBox="0 0 440 1056"><defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ecb2e"/><stop offset="1" stop-color="#d8c61a"/></linearGradient><linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c8aa0"/><stop offset="1" stop-color="#2aa7b8"/></linearGradient></defs><g opacity="0.075" transform="translate(0 300) scale(4.4)"><path d="M28 16 H88 L74 32 H42 Z" fill="url(#t)"/><path d="M28 16 L42 32 V88 L28 82 Z" fill="url(#v)"/><path d="M46 56 L62 56 L46 72 Z" fill="#a9c62b"/><path d="M64 56 L80 56 L58 78 L46 78 Z" fill="#d8c61a"/></g></svg>`
  );

// Fixed brand colours, not theme variables: this is the document a brand receives and prints, so it
// looks the same in dark mode, in the PDF, and on paper.
const TEAL = "#1f6f78";
const INK = "#1f2328";

function toParagraphs(segments: Segment[]): Segment[][] {
  const paragraphs: Segment[][] = [[]];
  for (const seg of segments) {
    const pieces = seg.text.split(/\n{2,}/);
    pieces.forEach((piece, i) => {
      if (i > 0) paragraphs.push([]);
      if (piece) paragraphs[paragraphs.length - 1].push({ kind: seg.kind, text: piece });
    });
  }
  return paragraphs.filter((p) => p.length > 0);
}

function Marked({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "same" ? (
          <span key={i}>{s.text}</span>
        ) : s.kind === "added" ? (
          <ins key={i} className="contract-ins">
            {s.text}
          </ins>
        ) : (
          <span key={i}>
            <del className="contract-del">{s.text}</del>
            {/* A replacement reads as "old new", not "oldnew". */}
            {segments[i + 1]?.kind === "added" && !/\s$/.test(s.text) && !/^\s/.test(segments[i + 1].text) ? " " : null}
          </span>
        )
      )}
    </>
  );
}

function Rich({ segments, className }: { segments: Segment[]; className?: string }) {
  return (
    <>
      {toParagraphs(segments).map((p, i) => (
        <p key={i} className={className} style={{ whiteSpace: "pre-line", margin: "0 0 9px" }}>
          <Marked segments={p} />
        </p>
      ))}
    </>
  );
}

const plain = (text: string): Segment[] => (text ? [{ kind: "same", text }] : []);

function Table({ rows, twoColumn }: { rows: RowDiff[]; twoColumn?: boolean }) {
  if (rows.length === 0) return null;
  if (twoColumn) {
    return (
      <table className="contract-table" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            {rows.map((r) => (
              <th key={r.key} style={{ textAlign: "left", fontWeight: 700 }}>
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((line) => (
            <tr key={line}>
              {rows.map((r) => {
                const text = r.segments.map((s) => s.text).join("").split("\n")[line] ?? "";
                return <td key={r.key}>{text}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <table className="contract-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={r.status === "removed" ? "contract-row-removed" : r.status === "added" ? "contract-row-added" : undefined}>
            <th>{r.label}</th>
            <td style={{ whiteSpace: "pre-line" }}>
              <Marked segments={r.segments} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The agreement in Fidem's house style — header with the logo, teal numbered headings, key/value
 * tables, a faded logo watermark and a confidential footer. Pass `diff` to show tracked changes;
 * without it this is the clean copy a brand receives.
 */
export default function ContractDocument({ built, diff, showRenumbering = true }: { built: BuiltContract; diff?: SectionDiff[] | null; showRenumbering?: boolean }) {
  const sections: SectionDiff[] =
    diff ??
    built.sections.map((s) => ({
      id: s.id,
      number: s.number,
      title: s.title,
      kind: s.kind,
      status: "same",
      renumberedFrom: null,
      body: plain(s.body),
      table: s.table.map((r) => ({ key: r.key, label: r.label, status: "same" as const, segments: plain(r.value) })),
      note: plain(s.note),
    }));

  return (
    <div className="contract-doc" style={{ color: INK }}>
      <ContractStyles />
      <div className="contract-watermark" aria-hidden>
        <Logo size={420} />
      </div>

      <header className="contract-header">
        <Logo size={34} />
        <div style={{ textAlign: "right", lineHeight: 1.1 }}>
          <div style={{ color: TEAL, fontWeight: 800, fontSize: 17, letterSpacing: "0.01em" }}>FIDEM GROWTH</div>
          <div style={{ color: "#6b7280", fontStyle: "italic", fontSize: 11 }}>Trusted Scale</div>
        </div>
      </header>

      <h1 style={{ color: TEAL, textAlign: "center", fontSize: 25, fontWeight: 700, margin: "22px 0 4px", letterSpacing: "0.01em" }}>{built.title}</h1>
      <p style={{ textAlign: "center", margin: "0 0 18px", fontSize: 13.5, color: "#374151" }}>{built.subtitle}</p>

      {sections.map((s) => (
        <section
          key={s.id}
          id={`contract-section-${s.id}`}
          className={`contract-section ${s.kind === "signature" ? "contract-signature" : ""} ${s.status === "removed" ? "contract-section-removed" : ""} ${s.status === "added" ? "contract-section-added" : ""}`}
        >
          {s.kind === "clause" && (
            <h2 style={{ color: TEAL, fontSize: 16, fontWeight: 700, margin: "18px 0 8px" }}>
              {s.status === "removed" ? <del className="contract-del">{`${s.number}. ${s.title}`}</del> : `${s.number}. ${s.title}`}
              {showRenumbering && s.renumberedFrom !== null && <span className="contract-renumbered">was {s.renumberedFrom}</span>}
            </h2>
          )}
          {s.body.length > 0 && <Rich segments={s.body} />}
          <Table rows={s.table} twoColumn={s.kind === "signature"} />
          {s.note.length > 0 && <Rich segments={s.note} className="contract-note" />}
        </section>
      ))}

      <footer className="contract-footer-screen">
        <span>Fidem Growth — Confidential</span>
        <span>fidemgrowth.com</span>
      </footer>
    </div>
  );
}

function ContractStyles() {
  return (
    <style>{`
      .contract-doc { position: relative; background: #fff url("${WATERMARK_TILE}") center top / 440px 1056px repeat-y; font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; line-height: 1.5; padding: 36px 52px 28px; overflow: hidden; }
      .contract-doc p { text-align: left; }
      .contract-header { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-bottom: 10px; border-bottom: 1px solid #c9cdd2; position: relative; z-index: 1; }
      .contract-watermark { display: none; }
      .contract-section { position: relative; z-index: 1; break-inside: auto; }
      .contract-section h2 { break-after: avoid; }
      .contract-table { width: calc(100% - 50px); margin: 10px 25px 12px; border-collapse: collapse; font-size: 12.5px; }
      .contract-table th, .contract-table td { border: 1px solid #cfd4da; padding: 7px 12px; vertical-align: top; text-align: left; }
      .contract-table th { background: #f2f3f5; width: 27%; font-weight: 700; }
      .contract-signature .contract-table th { width: auto; background: #fff; }
      .contract-signature .contract-table td { height: 34px; }
      .contract-signature { break-inside: avoid; margin-top: 26px; }
      .contract-table tr { break-inside: avoid; }
      .contract-note { font-style: italic; font-size: 12px; }
      .contract-ins { background: #dcfce7; color: #14532d; text-decoration: underline; text-decoration-color: #16a34a; }
      .contract-del { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
      .contract-row-added td, .contract-row-added th { background: #f0fdf4; }
      .contract-row-removed td, .contract-row-removed th { background: #fef2f2; }
      .contract-section-added { border-left: 3px solid #16a34a; padding-left: 10px; margin-left: -13px; }
      .contract-section-removed { opacity: 0.75; }
      .contract-renumbered { margin-left: 8px; font-size: 10.5px; font-weight: 600; color: #92400e; background: #fef3c7; border-radius: 999px; padding: 1px 7px; vertical-align: middle; }
      .contract-footer-screen { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 10.5px; color: #6b7280; position: relative; z-index: 1; }
    `}</style>
  );
}

import Logo from "@/app/components/Logo";
import ContractDocument from "./ContractDocument";
import type { BuiltContract } from "@/lib/contracts/template";
import type { SectionDiff } from "@/lib/contracts/diff";

/**
 * The agreement laid out for printing to PDF: letter pages, the Fidem header repeated at the top of
 * every page, the logo watermark centred on every page, and "Fidem Growth — Confidential" with
 * "Page X of Y" in the footer. Used by /contract-pdf/[id].
 */
export default function ContractPrintLayout({ built, diff, compareLabel }: { built: BuiltContract; diff: SectionDiff[] | null; compareLabel: string }) {
  return (
    <div className="contract-print-root">
      <style>{`
      html, body { background: #e5e7eb; }
      .contract-print-page { max-width: 8.5in; margin: 0 auto 40px; box-shadow: 0 8px 30px rgba(0,0,0,0.12); background: #fff; }
      .print-running-header { display: none; }
      @page {
        size: letter;
        margin: 16mm 15mm 18mm;
        @bottom-left { content: "Fidem Growth — Confidential"; font: 8.5pt Arial, sans-serif; color: #6b7280; }
        @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8.5pt Arial, sans-serif; color: #6b7280; }
      }
      @media print {
        html, body { background: #fff !important; }
        .contract-print-page { box-shadow: none; max-width: none; margin: 0; }
        .contract-doc { background: #fff !important; padding: 0 6mm !important; overflow: visible !important; }
        .contract-doc > .contract-header, .contract-footer-screen { display: none !important; }
        .print-running-header { display: table-header-group; }
        .contract-watermark { display: block !important; position: fixed; left: 50%; top: 52%; transform: translate(-50%, -50%); opacity: 0.075; z-index: 0; }
        .contract-ins, .contract-del, .contract-renumbered, .contract-table th, .contract-row-added td, .contract-row-removed td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .contract-watermark svg { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>

      <div className="contract-print-page">
        {/* The header row of a table repeats at the top of every printed page. */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead className="print-running-header">
            <tr>
              <td style={{ padding: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 10,
                    paddingBottom: 8,
                    marginBottom: 14,
                    borderBottom: "1px solid #c9cdd2",
                    fontFamily: "Arial, Helvetica, sans-serif",
                  }}
                >
                  <Logo size={30} />
                  <div style={{ textAlign: "right", lineHeight: 1.1 }}>
                    <div style={{ color: "#1f6f78", fontWeight: 800, fontSize: 15 }}>FIDEM GROWTH</div>
                    <div style={{ color: "#6b7280", fontStyle: "italic", fontSize: 10 }}>Trusted Scale</div>
                  </div>
                </div>
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: 0 }}>
                {compareLabel && (
                  <div
                    style={{
                      fontFamily: "Arial, sans-serif",
                      fontSize: 11,
                      margin: "0 0 6px",
                      padding: "6px 10px",
                      background: "#fffbeb",
                      border: "1px solid #fcd34d",
                      borderRadius: 6,
                      color: "#78350f",
                      WebkitPrintColorAdjust: "exact",
                      printColorAdjust: "exact",
                    }}
                  >
                    Redline — {compareLabel}. <ins className="contract-ins">Added text</ins> · <del className="contract-del">removed text</del>
                  </div>
                )}
                <ContractDocument built={built} diff={diff} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

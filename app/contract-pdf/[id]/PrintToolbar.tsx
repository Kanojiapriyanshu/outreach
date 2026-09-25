"use client";

import { useEffect } from "react";

/**
 * Opens the print dialog once the page has laid out, with the PDF's file name pre-set (browsers use
 * the page title as the suggested name for "Save as PDF").
 */
export default function PrintToolbar({ fileName, compareLabel }: { fileName: string; compareLabel: string }) {
  useEffect(() => {
    document.title = fileName;
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, [fileName]);

  return (
    <div className="print:hidden" style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "center", gap: 12, alignItems: "center", padding: "10px 16px", background: "#111827", color: "#f9fafb", fontFamily: "Arial, sans-serif", fontSize: 13, marginBottom: 24 }}>
      <span>
        {compareLabel ? "Redline" : "Clean copy for the brand"} — in the print window choose <b>Save as PDF</b>, and turn off <b>Headers and footers</b>.
      </span>
      <button onClick={() => window.print()} style={{ background: "#14b8a6", color: "#042f2e", fontWeight: 700, border: 0, borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>
        Save as PDF
      </button>
    </div>
  );
}

"use client";

/** Lets the brand keep a PDF copy through the browser's own print dialog. */
export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 print:hidden">
      Save as PDF
    </button>
  );
}

"use client";

import { useState } from "react";
import { MailSearch } from "lucide-react";
import GmailSyncDialog from "./GmailSyncDialog";

export default function GmailSyncButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm" title="Add creators you emailed straight from Gmail who have replied">
        <MailSearch size={15} /> Sync Gmail replies
      </button>
      {open && <GmailSyncDialog onClose={() => setOpen(false)} />}
    </>
  );
}

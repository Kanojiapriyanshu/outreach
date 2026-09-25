"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";

export default function NewContractButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.ok) router.push(`/contracts/${(await res.json()).id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={() => void create()} disabled={busy} className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm disabled:opacity-60">
      {busy ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />} New contract
    </button>
  );
}

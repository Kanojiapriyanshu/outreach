/**
 * Word-level tracked changes between two built contracts — the base (the standard template, or the
 * version last sent to the brand) and the current draft. Pure.
 */
import type { BuiltContract, BuiltSection, TableRow } from "./template";

export type Segment = { kind: "same" | "added" | "removed"; text: string };

// Words, runs of spaces, and line breaks are separate tokens, so paragraph breaks survive a diff.
function tokenize(text: string): string[] {
  return text.match(/\n+|[^\S\n]+|[^\s]+/g) ?? [];
}

const MAX_CELLS = 4_000_000;

/** Longest-common-subsequence diff over word tokens, merged into runs. */
export function wordDiff(before: string, after: string): Segment[] {
  if (before === after) return before ? [{ kind: "same", text: before }] : [];
  const a = tokenize(before);
  const b = tokenize(after);

  // Trim the shared start and end first — edits are usually local, which keeps the table small.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  // Token-level edit script first, then grouped into readable runs below.
  const ops: Segment[] = [];
  for (const t of a.slice(0, start)) ops.push({ kind: "same", text: t });

  if (midA.length * midB.length > MAX_CELLS) {
    // Too different to align word by word — show it as a straight replacement.
    ops.push({ kind: "removed", text: midA.join("") }, { kind: "added", text: midB.join("") });
  } else {
    const n = midA.length;
    const m = midB.length;
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push({ kind: "same", text: midA[i] });
        i++;
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        ops.push({ kind: "removed", text: midA[i++] });
      } else {
        ops.push({ kind: "added", text: midB[j++] });
      }
    }
    while (i < n) ops.push({ kind: "removed", text: midA[i++] });
    while (j < m) ops.push({ kind: "added", text: midB[j++] });
  }

  for (const t of a.slice(endA)) ops.push({ kind: "same", text: t });
  return groupChanges(ops);
}

/**
 * "seven (7)" → "ten (10)" should read as one replacement, not two: a run of spaces that only
 * separates two edits joins the edit, and each changed region shows everything removed, then
 * everything added.
 */
const SPACES = /^[^\S\n]+$/;

function groupChanges(ops: Segment[]): Segment[] {
  const out: Segment[] = [];
  const push = (kind: Segment["kind"], text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  while (i < ops.length) {
    if (ops[i].kind === "same") {
      push("same", ops[i++].text);
      continue;
    }
    let removed = "";
    let added = "";
    while (i < ops.length) {
      const op = ops[i];
      if (op.kind === "removed") removed += op.text;
      else if (op.kind === "added") added += op.text;
      else {
        // Whitespace between two edits belongs to the edit; anything else ends it.
        const next = ops.slice(i + 1).find((o) => !(o.kind === "same" && SPACES.test(o.text)));
        if (!SPACES.test(op.text) || !next || next.kind === "same") break;
        removed += op.text;
        added += op.text;
      }
      i++;
    }
    push("removed", removed);
    push("added", added);
  }
  return out;
}

export function hasChanges(segments: Segment[]): boolean {
  return segments.some((s) => s.kind !== "same");
}

export interface RowDiff {
  key: string;
  label: string;
  status: "same" | "changed" | "added" | "removed";
  segments: Segment[];
}

export interface SectionDiff {
  id: string;
  number: number;
  title: string;
  kind: BuiltSection["kind"];
  status: "same" | "changed" | "added" | "removed";
  /** The old number when it moved because a clause before it was added or removed. */
  renumberedFrom: number | null;
  body: Segment[];
  table: RowDiff[];
  note: Segment[];
}

function diffRows(before: TableRow[], after: TableRow[]): RowDiff[] {
  const beforeByKey = new Map(before.map((r) => [r.key, r]));
  const afterKeys = new Set(after.map((r) => r.key));
  const rows: RowDiff[] = after.map((r) => {
    const old = beforeByKey.get(r.key);
    if (!old) return { key: r.key, label: r.label, status: "added", segments: [{ kind: "added", text: r.value }] };
    const segments = wordDiff(old.value, r.value);
    return { key: r.key, label: r.label, status: hasChanges(segments) ? "changed" : "same", segments };
  });
  // Rows that disappeared go back in where they were, so the table still reads in order.
  before.forEach((r, index) => {
    if (afterKeys.has(r.key)) return;
    rows.splice(Math.min(index, rows.length), 0, { key: r.key, label: r.label, status: "removed", segments: [{ kind: "removed", text: r.value }] });
  });
  return rows;
}

/** The current contract with every difference from the base marked, clause by clause. */
export function diffContracts(base: BuiltContract, current: BuiltContract): SectionDiff[] {
  const baseById = new Map(base.sections.map((s) => [s.id, s]));
  const currentIds = new Set(current.sections.map((s) => s.id));
  const out: SectionDiff[] = current.sections.map((s) => {
    const old = baseById.get(s.id);
    if (!old) {
      return {
        id: s.id,
        number: s.number,
        title: s.title,
        kind: s.kind,
        status: "added",
        renumberedFrom: null,
        body: s.body ? [{ kind: "added", text: s.body }] : [],
        table: s.table.map((r) => ({ key: r.key, label: r.label, status: "added", segments: [{ kind: "added", text: r.value }] })),
        note: s.note ? [{ kind: "added", text: s.note }] : [],
      };
    }
    const body = wordDiff(old.body, s.body);
    const table = diffRows(old.table, s.table);
    const note = wordDiff(old.note, s.note);
    const titleChanged = old.title !== s.title;
    const changed = titleChanged || hasChanges(body) || hasChanges(note) || table.some((r) => r.status !== "same");
    return {
      id: s.id,
      number: s.number,
      title: s.title,
      kind: s.kind,
      status: changed ? "changed" : "same",
      renumberedFrom: s.kind === "clause" && old.number !== s.number ? old.number : null,
      body,
      table,
      note,
    };
  });

  base.sections.forEach((s, index) => {
    if (currentIds.has(s.id)) return;
    out.splice(Math.min(index, out.length), 0, {
      id: s.id,
      number: s.number,
      title: s.title,
      kind: s.kind,
      status: "removed",
      renumberedFrom: null,
      body: s.body ? [{ kind: "removed", text: s.body }] : [],
      table: s.table.map((r) => ({ key: r.key, label: r.label, status: "removed", segments: [{ kind: "removed", text: r.value }] })),
      note: s.note ? [{ kind: "removed", text: s.note }] : [],
    });
  });
  return out;
}

/** One line per changed clause, for the change summary: "Clause 4 Fees & Payment Terms — 2 edits". */
export function changeSummary(diff: SectionDiff[]): { id: string; label: string; status: SectionDiff["status"]; edits: number }[] {
  return diff
    .filter((s) => s.status !== "same")
    .map((s) => {
      const edits =
        s.body.filter((x) => x.kind !== "same").length +
        s.note.filter((x) => x.kind !== "same").length +
        s.table.filter((r) => r.status !== "same").length;
      return { id: s.id, label: s.number ? `${s.number}. ${s.title}` : s.title, status: s.status, edits };
    });
}

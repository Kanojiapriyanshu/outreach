"use client";

import { Lock, Plus, Sparkles, X } from "lucide-react";
import { formatMoney } from "@/lib/creatorReplyAnalysis";
import { formatContractDate, type ContractFields } from "@/lib/contracts/template";
import { dealSummary } from "@/lib/contracts/analyze";
import { Card, Choice, Label, NumberInput, Suggest, TextInput, Toggle } from "./ui";

interface CreatorHit {
  id: string;
  name: string;
  channelUrl: string;
  subscriberCount: number | null;
  quotedRate: number | null;
  quotedRateCurrency: string | null;
}

interface BrandHit {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
}

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "AED", "SGD"];
const LAWS = ["the State of New York, USA", "the State of Delaware, USA", "the State of California, USA", "England and Wales", "India", "Singapore"];

async function lookup<T>(kind: "creator" | "brand", q: string): Promise<T[]> {
  const res = await fetch(`/api/contracts/lookup?kind=${kind}&q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return (await res.json()).results as T[];
}

function compact(n: number | null): string {
  if (n === null) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Left-hand fields. Every change rebuilds the contract on the right. */
export default function DetailsPanel({ fields, update }: { fields: ContractFields; update: (patch: Partial<ContractFields>) => void }) {
  const f = fields;
  const deal = dealSummary(f);
  const money = (n: number | null) => (n === null ? "—" : formatMoney(n, deal.currency));

  function addCreatorFromRoster(hit: CreatorHit) {
    if (f.creators.some((c) => c.channelUrl && c.channelUrl === hit.channelUrl)) return;
    const patch: Partial<ContractFields> = { creators: [...f.creators, { name: hit.name, realName: "", channelUrl: hit.channelUrl }] };
    // Their quote is what Fidem will owe them — fill the internal cost so the margin checks work.
    if (hit.quotedRate !== null && (!hit.quotedRateCurrency || hit.quotedRateCurrency === f.currency)) patch.creatorCost = (f.creatorCost ?? 0) + hit.quotedRate;
    update(patch);
  }

  function suggestCampaignName() {
    const product = f.productName.trim() || f.brandName.trim();
    const what = /short/i.test(f.deliverables) ? "YouTube Short" : /integrat/i.test(f.deliverables) ? "YouTube Integration" : "Dedicated YouTube Video";
    update({ campaignName: [f.brandName.trim() && product !== f.brandName.trim() ? `${f.brandName.trim()} ${product}` : product, what].filter(Boolean).join(" — ") });
  }

  return (
    <div className="space-y-3">
      <Card title="Client & brand">
        <Label label="Brand">
          <div className="space-y-1.5">
            <TextInput id="field-brandName" value={f.brandName} onChange={(v) => update({ brandName: v })} placeholder="SEVVS" />
            <Suggest<BrandHit>
              placeholder="…or pick a brand from your CRM"
              fetchResults={(q) => lookup<BrandHit>("brand", q)}
              render={(b) => (
                <span>
                  <span className="font-medium">{b.name}</span>
                  {b.contactEmail && <span className="text-[var(--muted-2)]"> · {b.contactName || b.contactEmail}</span>}
                </span>
              )}
              onPick={(b) =>
                update({
                  brandName: b.name,
                  ...(f.clientName.trim() ? {} : { clientName: b.contactName }),
                  ...(f.clientEmail.trim() ? {} : { clientEmail: b.contactEmail }),
                })
              }
            />
          </div>
        </Label>
        <div className="flex gap-2">
          <Label htmlFor="field-productName" label="Product">
            <TextInput id="field-productName" value={f.productName} onChange={(v) => update({ productName: v })} placeholder="Smart Brewmaster S1" />
          </Label>
        </div>
        <div className="flex gap-2">
          <Label htmlFor="field-clientName" label="Client (who signs)">
            <TextInput id="field-clientName" value={f.clientName} onChange={(v) => update({ clientName: v })} placeholder="Summer Wen" />
          </Label>
          <Label htmlFor="field-clientEmail" label="Client email">
            <TextInput id="field-clientEmail" value={f.clientEmail} onChange={(v) => update({ clientEmail: v })} placeholder="name@brand.com" />
          </Label>
        </div>
        <Label htmlFor="field-clientRepresents" label="Acting for (optional)" hint='Printed after the client name, e.g. "on behalf of her agency and SEVVS".'>
          <TextInput id="field-clientRepresents" value={f.clientRepresents} onChange={(v) => update({ clientRepresents: v })} placeholder="on behalf of her agency and SEVVS" />
        </Label>
        <Label htmlFor="field-effectiveDate" label="Effective date" hint={f.effectiveDate ? formatContractDate(f.effectiveDate) : "Blank prints a line to fill in by hand."}>
          <div className="flex gap-2">
            <TextInput id="field-effectiveDate" type="date" value={f.effectiveDate} onChange={(v) => update({ effectiveDate: v })} />
            <button type="button" className="btn-secondary px-2.5 text-xs" onClick={() => update({ effectiveDate: todayIso() })}>
              Today
            </button>
          </div>
        </Label>
      </Card>

      <Card title="Campaign & creators">
        <Label htmlFor="field-campaignName" label="Campaign name">
          <div className="flex gap-2">
            <TextInput id="field-campaignName" value={f.campaignName} onChange={(v) => update({ campaignName: v })} placeholder="SEVVS Smart Brewmaster S1 — Dedicated YouTube Video" />
            <button type="button" onClick={suggestCampaignName} className="btn-secondary px-2.5 text-xs inline-flex items-center gap-1" title="Build it from the brand, product and deliverable">
              <Sparkles size={12} />
            </button>
          </div>
        </Label>

        <div id="field-creators" tabIndex={-1} className="space-y-2 outline-none">
          <span className="block text-[11px] font-medium text-[var(--muted)]">Creator(s)</span>
          {f.creators.map((c, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-2 space-y-1.5">
              <div className="flex gap-1.5">
                <input className="input py-1 text-sm" value={c.name} placeholder="Channel name" onChange={(e) => update({ creators: f.creators.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <button type="button" onClick={() => update({ creators: f.creators.filter((_, j) => j !== i) })} className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)]" aria-label={`Remove ${c.name || "creator"}`}>
                  <X size={14} />
                </button>
              </div>
              <div className="flex gap-1.5">
                <input className="input py-1 text-xs" value={c.realName} placeholder="Person's name (optional)" onChange={(e) => update({ creators: f.creators.map((x, j) => (j === i ? { ...x, realName: e.target.value } : x)) })} />
                <input className="input py-1 text-xs" value={c.channelUrl} placeholder="youtube.com/@handle" onChange={(e) => update({ creators: f.creators.map((x, j) => (j === i ? { ...x, channelUrl: e.target.value } : x)) })} />
              </div>
            </div>
          ))}
          <Suggest<CreatorHit>
            placeholder="Add a creator from your roster…"
            fetchResults={(q) => lookup<CreatorHit>("creator", q)}
            render={(c) => (
              <span>
                <span className="font-medium">{c.name}</span>
                <span className="text-[var(--muted-2)]">
                  {c.subscriberCount !== null ? ` · ${compact(c.subscriberCount)} subs` : ""}
                  {c.quotedRate !== null ? ` · quoted ${formatMoney(c.quotedRate, c.quotedRateCurrency)}` : ""}
                </span>
              </span>
            )}
            onPick={addCreatorFromRoster}
          />
          <button type="button" onClick={() => update({ creators: [...f.creators, { name: "", realName: "", channelUrl: "" }] })} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--brand-teal-dark)" }}>
            <Plus size={12} /> Add one by hand
          </button>
        </div>

        <Label htmlFor="field-deliverables" label="Deliverable(s)">
          <TextInput id="field-deliverables" value={f.deliverables} onChange={(v) => update({ deliverables: v })} placeholder="1 dedicated YouTube video featuring the product" />
        </Label>
        <Label htmlFor="field-productType" label="Product">
          <Choice
            id="field-productType"
            value={f.productType}
            onChange={(v) => update({ productType: v })}
            options={[
              { value: "retail", label: "Retail unit (creator keeps it)" },
              { value: "prototype", label: "Prototype (brand collects it)" },
              { value: "none", label: "No product" },
            ]}
          />
        </Label>
        {f.productType !== "none" && (
          <>
            <Label htmlFor="field-shippingPaidBy" label="Shipping paid by">
              <Choice
                id="field-shippingPaidBy"
                value={f.shippingPaidBy}
                onChange={(v) => update({ shippingPaidBy: v })}
                options={[
                  { value: "client", label: "Brand" },
                  { value: "fidem", label: "Included in fee" },
                ]}
              />
            </Label>
            <Label htmlFor="field-creatorShippingAddress" label="Creator's shipping address (optional)" hint="Printed in the brand's copy — see the deal check before including it.">
              <textarea id="field-creatorShippingAddress" className="input py-1.5 text-sm" rows={2} value={f.creatorShippingAddress} onChange={(e) => update({ creatorShippingAddress: e.target.value })} />
            </Label>
          </>
        )}
        <Label htmlFor="field-goLiveDate" label="Go-live date (optional)" hint="Blank = coordinated after draft approval.">
          <TextInput id="field-goLiveDate" type="date" value={f.goLiveDate} onChange={(v) => update({ goLiveDate: v })} />
        </Label>
      </Card>

      <Card title="Money">
        <div className="flex gap-2">
          <Label htmlFor="field-fee" label="Campaign fee (all-inclusive)">
            <NumberInput id="field-fee" value={f.fee} onChange={(v) => update({ fee: v })} min={0} allowEmpty placeholder="2800" />
          </Label>
          <div className="w-24">
            <Label htmlFor="field-currency" label="Currency">
              <select id="field-currency" className="input py-1.5 text-sm" value={f.currency} onChange={(e) => update({ currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Label>
          </div>
        </div>
        <div className="flex gap-2">
          <Label htmlFor="field-depositPercent" label="Upfront">
            <NumberInput id="field-depositPercent" value={f.depositPercent} onChange={(v) => update({ depositPercent: v ?? 0 })} min={0} max={100} step={1} suffix="%" />
          </Label>
          <Label htmlFor="field-depositBusinessDays" label="Due within">
            <NumberInput id="field-depositBusinessDays" value={f.depositBusinessDays} onChange={(v) => update({ depositBusinessDays: v ?? 7 })} min={1} max={60} step={1} suffix="business days" />
          </Label>
        </div>
        <Label htmlFor="field-lateFeePercentMonthly" label="Late-payment charge (optional)">
          <NumberInput id="field-lateFeePercentMonthly" value={f.lateFeePercentMonthly} onChange={(v) => update({ lateFeePercentMonthly: v })} min={0} max={10} allowEmpty suffix="% per month" placeholder="e.g. 1.5" />
        </Label>
        <Label
          htmlFor="field-creatorCost"
          label="What you pay the creator(s)"
          hint={
            <span className="inline-flex items-center gap-1">
              <Lock size={10} /> Internal — never printed. Used for margin and deposit checks.
            </span>
          }
        >
          <NumberInput id="field-creatorCost" value={f.creatorCost} onChange={(v) => update({ creatorCost: v })} min={0} allowEmpty placeholder="e.g. 1800" />
        </Label>
        <div className="rounded-lg px-3 py-2 text-xs space-y-0.5" style={{ background: "var(--bg)" }}>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Upfront {f.depositPercent}%</span>
            <span className="font-medium text-[var(--ink)]">
              {money(deal.deposit)}
              {deal.depositDueBy ? ` by ${formatContractDate(deal.depositDueBy)}` : ""}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Before go-live</span>
            <span className="font-medium text-[var(--ink)]">{money(deal.balance)}</span>
          </div>
          {deal.margin !== null && (
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Your margin</span>
              <span className="font-semibold" style={{ color: deal.margin < 0 ? "var(--danger-fg)" : "var(--success-fg)" }}>
                {money(deal.margin)} ({deal.marginPercent!.toFixed(0)}%)
              </span>
            </div>
          )}
        </div>
      </Card>

      <Card title="Timeline" hint="Counted from when the creator receives the product.">
        <div className="grid grid-cols-2 gap-2">
          <Label htmlFor="field-scriptDays" label="Script / outline due">
            <NumberInput id="field-scriptDays" value={f.scriptDays} onChange={(v) => update({ scriptDays: v ?? 7 })} min={1} max={90} step={1} suffix="days" />
          </Label>
          <Label htmlFor="field-draftDays" label="Video draft due">
            <NumberInput id="field-draftDays" value={f.draftDays} onChange={(v) => update({ draftDays: v ?? 14 })} min={1} max={120} step={1} suffix="days" />
          </Label>
          <Label htmlFor="field-feedbackBusinessDays" label="Brand feedback within">
            <NumberInput id="field-feedbackBusinessDays" value={f.feedbackBusinessDays} onChange={(v) => update({ feedbackBusinessDays: v ?? 3 })} min={1} max={30} step={1} suffix="bus. days" />
          </Label>
          <Label htmlFor="field-revisionRounds" label="Included revisions">
            <NumberInput id="field-revisionRounds" value={f.revisionRounds} onChange={(v) => update({ revisionRounds: v ?? 1 })} min={0} max={5} step={1} suffix="rounds" />
          </Label>
        </div>
      </Card>

      <Card title="Rights & protection">
        <Label htmlFor="field-usageRights" label="Usage rights">
          <Choice
            id="field-usageRights"
            value={f.usageRights}
            onChange={(v) => update({ usageRights: v })}
            options={[
              { value: "tbc", label: "Confirm later" },
              { value: "defined", label: "Set a period" },
            ]}
          />
        </Label>
        {f.usageRights === "defined" && (
          <div className="flex gap-2 items-end">
            <Label htmlFor="field-usageDays" label="Licence length">
              <NumberInput id="field-usageDays" value={f.usageDays} onChange={(v) => update({ usageDays: v ?? 30 })} min={1} max={3650} step={1} suffix="days" />
            </Label>
            <div className="pb-2">
              <Toggle id="field-usagePaid" checked={f.usagePaid} onChange={(v) => update({ usagePaid: v })} label="Includes paid ads" />
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Label htmlFor="field-nonCircumventionMonths" label="Non-circumvention">
            <NumberInput id="field-nonCircumventionMonths" value={f.nonCircumventionMonths} onChange={(v) => update({ nonCircumventionMonths: v ?? 12 })} min={0} max={60} step={1} suffix="months" />
          </Label>
          <Label htmlFor="field-terminationNoticeDays" label="Termination notice">
            <NumberInput id="field-terminationNoticeDays" value={f.terminationNoticeDays} onChange={(v) => update({ terminationNoticeDays: v ?? 14 })} min={1} max={180} step={1} suffix="days" />
          </Label>
        </div>
        <Label htmlFor="field-governingLaw" label="Governing law" hint='Blank keeps "agree a forum later". Write it as it should read: "the laws of …".'>
          <TextInput id="field-governingLaw" list="contract-laws" value={f.governingLaw} onChange={(v) => update({ governingLaw: v })} placeholder="the State of New York, USA" />
          <datalist id="contract-laws">
            {LAWS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Label>
        {f.productType !== "none" && (
          <Toggle id="field-deemedAcceptanceOnShipment" checked={f.deemedAcceptanceOnShipment} onChange={(v) => update({ deemedAcceptanceOnShipment: v })} label="Shipping the product counts as accepting the agreement" />
        )}
      </Card>

      <Card title="Contacts & signatures">
        <div className="flex gap-2">
          <Label htmlFor="field-agencyContactName" label="Fidem contact">
            <TextInput id="field-agencyContactName" value={f.agencyContactName} onChange={(v) => update({ agencyContactName: v })} />
          </Label>
          <Label htmlFor="field-agencyContactTitle" label="Title">
            <TextInput id="field-agencyContactTitle" value={f.agencyContactTitle} onChange={(v) => update({ agencyContactTitle: v })} />
          </Label>
        </div>
        <Label htmlFor="field-agencyContactEmail" label="Fidem contact email">
          <TextInput id="field-agencyContactEmail" value={f.agencyContactEmail} onChange={(v) => update({ agencyContactEmail: v })} />
        </Label>
        <div className="flex gap-2">
          <Label htmlFor="field-fidemSignatoryName" label="Signs for Fidem">
            <TextInput id="field-fidemSignatoryName" value={f.fidemSignatoryName} onChange={(v) => update({ fidemSignatoryName: v })} />
          </Label>
          <Label htmlFor="field-clientSignatoryName" label="Signs for the client">
            <TextInput id="field-clientSignatoryName" value={f.clientSignatoryName} onChange={(v) => update({ clientSignatoryName: v })} placeholder={f.clientName || "Name"} />
          </Label>
        </div>
      </Card>
    </div>
  );
}

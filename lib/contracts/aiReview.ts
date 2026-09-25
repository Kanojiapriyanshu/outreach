import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["ready_to_send", "send_after_fixes", "needs_rework"],
      description: "Whether Fidem can send this to the brand as it stands.",
    },
    summary: { type: "string", description: "Two or three plain sentences on the overall state of the contract, for the agency's CEO." },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["blocker", "risk", "tip"] },
          clause: { type: "string", description: 'Where it is, e.g. "Clause 4" or "Campaign table — Agreed Rate". Empty if contract-wide.' },
          issue: { type: "string", description: "What's wrong, in one or two plain sentences." },
          suggestion: { type: "string", description: "Replacement wording or a concrete action. Wording should be ready to paste into the clause." },
        },
        required: ["severity", "clause", "issue", "suggestion"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdict", "summary", "issues"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You review client services agreements for Fidem Growth, an influencer-marketing agency that sources YouTube creators for brands, negotiates with them, and manages the campaign. The client is the brand (or an agency acting for it). Fidem drafted the agreement; you work for Fidem.

Review the agreement the way a sharp commercial lawyer and the agency's CEO would together, before it is sent to the brand:
- Protect Fidem: payment exposure, non-circumvention, liability, refunds, usage rights, and anything the brand could use to avoid paying or to hire the creator directly.
- Keep it signable: flag terms a reasonable brand would refuse, and anything so one-sided it could backfire.
- Consistency: the campaign table, the fields and the clauses must agree (fees, days, clause numbers and cross-references, names, parties).
- Ambiguity: undefined periods, "to be agreed" terms, missing dates, unclear parties or signing authority.
- Clauses marked [EDITED] or [CUSTOM] differ from Fidem's standard wording — scrutinise those most.

Do not repeat findings already listed under <known_findings> unless you have something materially new to add. Order issues most serious first, and keep them to what matters — no more than 10. You are not giving formal legal advice; where a point depends on jurisdiction, say so briefly.`;

export interface AiContractReview {
  verdict: "ready_to_send" | "send_after_fixes" | "needs_rework";
  summary: string;
  issues: { severity: "blocker" | "risk" | "tip"; clause: string; issue: string; suggestion: string }[];
}

export class AiReviewUnavailable extends Error {}

/** One structured review of the whole agreement. Throws AiReviewUnavailable when there's no key. */
export async function reviewContractWithAi(params: { contractText: string; dealSummary: string; knownFindings: string[] }): Promise<AiContractReview> {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiReviewUnavailable("AI review needs ANTHROPIC_API_KEY to be set on the server.");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.parse(
    {
      model: process.env.CONTRACT_AI_MODEL || "claude-opus-5",
      max_tokens: 16000,
      // A declined request re-runs on a fallback model inside the same call instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaJSONSchemaOutputFormat(REVIEW_SCHEMA) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `<deal_summary>\n${params.dealSummary}\n</deal_summary>`,
            `<known_findings>\n${params.knownFindings.length ? params.knownFindings.join("\n") : "(none)"}\n</known_findings>`,
            `<agreement>\n${params.contractText}\n</agreement>`,
          ].join("\n\n"),
        },
      ],
    },
    { timeout: 110_000 }
  );

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("The AI review couldn't be completed for this contract. The deal check above still applies.");
  }
  return response.parsed_output as AiContractReview;
}

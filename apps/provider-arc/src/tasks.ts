import type { Brief } from '@bazaar/shared';
import { z } from 'zod';

/** Injectable narrator so tests and MOCK runs stay offline; production wires an LLM. */
export type Summarizer = (text: string) => Promise<string>;

export const templateSummarizer: Summarizer = async (text) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 40) return text.trim();
  const head = words.slice(0, 35).join(' ');
  return `${head}… (${words.length} words summarised to key points)`;
};

export interface SummariseResult {
  summary: string;
  originalWordCount: number;
  summaryWordCount: number;
}

export async function summarise(text: string, summarizer: Summarizer = templateSummarizer): Promise<SummariseResult> {
  if (!text || !text.trim()) throw new Error('text must be non-empty');
  const summary = await summarizer(text);
  return { summary, originalWordCount: text.trim().split(/\s+/).filter(Boolean).length, summaryWordCount: summary.trim().split(/\s+/).filter(Boolean).length };
}

export const ClassifyRiskInputSchema = z.object({
  brief: z.object({
    subject: z.string().optional(),
    riskScore: z.number().min(0).max(100),
    reasons: z.array(z.string()).optional(),
    summary: z.string().optional(),
  }),
});

export interface RiskClassification {
  label: 'low' | 'moderate' | 'high';
  confidence: number; // 0–1
  rationale: string;
}

/**
 * Classifies a Brief (typically produced by provider-hedera) into a coarse label.
 * This is the cross-provider workflow: the buyer pays provider-hedera for a Brief,
 * then pays this route to get a second opinion, exercising both rails in one task.
 */
export function classifyRisk(input: z.infer<typeof ClassifyRiskInputSchema>): RiskClassification {
  const { brief } = ClassifyRiskInputSchema.parse(input);
  const label: RiskClassification['label'] = brief.riskScore >= 70 ? 'high' : brief.riskScore >= 40 ? 'moderate' : 'low';
  // Confidence peaks near the tier boundaries' midpoints and dips at the boundaries
  // themselves, where the input is genuinely ambiguous between two labels.
  const distanceFromBoundary = Math.min(Math.abs(brief.riskScore - 40), Math.abs(brief.riskScore - 70), brief.riskScore, 100 - brief.riskScore);
  const confidence = Math.max(0.5, Math.min(0.99, 0.5 + distanceFromBoundary / 40));
  const reasonSample = brief.reasons?.slice(0, 2).join('; ') ?? 'no reasons supplied';
  return {
    label,
    confidence: Number(confidence.toFixed(2)),
    rationale: `Score ${brief.riskScore}/100 falls in the ${label} band. Contributing factors: ${reasonSample}.`,
  };
}

export type { Brief };

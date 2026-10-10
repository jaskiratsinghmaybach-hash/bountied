/**
 * Evaluation service socket.
 *
 * v1 decision: NO automated grading. Problem-givers manually review every
 * submission. This interface exists so that when you're ready to add an
 * LLM-assisted first-pass (OpenAI/Anthropic API, or self-hosted Qwen on
 * RunPod), you implement one class and wire it in — no changes needed to
 * submission flow, schema, or UI beyond rendering `evaluationResult`.
 *
 * Cost note for future you: API-based (OpenAI/Anthropic) is $0 fixed cost,
 * pay-per-call — better until volume is high. RunPod GPU rental is a fixed
 * hourly cost regardless of usage — better once submission volume is high
 * enough to keep a GPU busy. Don't build the RunPod path until the API
 * path's bill tells you it's worth it.
 */

export interface EvaluationResult {
  /** 0-1 confidence score this submission correctly solves the problem */
  confidenceScore: number;
  /** short human-readable summary for the giver, e.g. "Passes stated requirements, no obvious edge-case gaps" */
  summary: string;
  /** flags worth the giver's attention, e.g. ["no error handling", "hardcoded test values"] */
  flags: string[];
  raw?: unknown;
}

export interface EvaluationService {
  evaluateSubmission(params: {
    problemDescription: string;
    submissionPreview: string; // the masked preview, NOT full code, until reveal
  }): Promise<EvaluationResult>;
}

/**
 * v1 stub — always returns a neutral non-opinionated result.
 * Swap for a real implementation (OpenAiEvaluationService, etc.) later.
 */
export class NullEvaluationService implements EvaluationService {
  async evaluateSubmission(): Promise<EvaluationResult> {
    return {
      confidenceScore: 0.5,
      summary: "Automated evaluation not yet enabled — please review manually.",
      flags: [],
    };
  }
}

export function getEvaluationService(): EvaluationService {
  return new NullEvaluationService();
}

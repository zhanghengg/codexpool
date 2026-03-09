/**
 * Token pricing configuration and cost estimation.
 *
 * Prices are expressed in USD per 1 million tokens.
 * Input and output tokens have separate rates because most
 * LLM providers charge differently for each direction.
 */

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5.3-codex":     { inputPer1M: 2.50,  outputPer1M: 10.00 },
  "gpt-4.1-codex":     { inputPer1M: 2.00,  outputPer1M: 8.00  },
  "o3-pro":            { inputPer1M: 20.00, outputPer1M: 80.00 },
  "o3-mini":           { inputPer1M: 1.10,  outputPer1M: 4.40  },
  "o3":                { inputPer1M: 2.00,  outputPer1M: 8.00  },
  "o4-mini":           { inputPer1M: 1.10,  outputPer1M: 4.40  },
  "gpt-4.1":           { inputPer1M: 2.00,  outputPer1M: 8.00  },
  "gpt-4.1-mini":      { inputPer1M: 0.40,  outputPer1M: 1.60  },
  "gpt-4.1-nano":      { inputPer1M: 0.10,  outputPer1M: 0.40  },
  "gpt-4o":            { inputPer1M: 2.50,  outputPer1M: 10.00 },
  "gpt-4o-mini":       { inputPer1M: 0.15,  outputPer1M: 0.60  },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 2.50, outputPer1M: 10.00 };

function getPricing(model: string | null | undefined): ModelPricing {
  if (!model) return DEFAULT_PRICING;
  return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

export function estimateCost(
  promptTokens: number,
  completionTokens: number,
  model?: string | null
): number {
  const pricing = getPricing(model);
  return (
    (promptTokens / 1_000_000) * pricing.inputPer1M +
    (completionTokens / 1_000_000) * pricing.outputPer1M
  );
}

export function estimateCostFromTotal(
  totalTokens: number,
  model?: string | null
): number {
  const pricing = getPricing(model);
  const blended = (pricing.inputPer1M + pricing.outputPer1M) / 2;
  return (totalTokens / 1_000_000) * blended;
}

/**
 * Smart cost estimation: uses prompt/completion split when available,
 * falls back to blended rate from totalTokens otherwise.
 */
export function estimateCostSmart(
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  model?: string | null
): number {
  if (promptTokens > 0 || completionTokens > 0) {
    return estimateCost(promptTokens, completionTokens, model);
  }
  if (totalTokens > 0) {
    return estimateCostFromTotal(totalTokens, model);
  }
  return 0;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

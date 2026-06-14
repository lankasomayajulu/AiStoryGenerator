const emptyUsageMeta = () => ({
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  costUsd: null,
  finishReason: null,
});

export const pickCostUsd = (usage) => {
  if (!usage || typeof usage !== 'object') return null;
  const candidates = [
    usage.cost,
    usage.total_cost,
    usage.totalCost,
    usage.prompt_cost,
    usage.completion_cost,
  ];
  if (usage.cost_details && typeof usage.cost_details === 'object') {
    const cd = usage.cost_details;
    candidates.push(cd.total, cd.upstream_inference_cost);
  }
  for (const c of candidates) {
    if (typeof c === 'number' && !Number.isNaN(c)) return c;
    if (typeof c === 'string' && c.trim() !== '') {
      const n = parseFloat(c);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
};

export const extractUsageMetaFromChunk = (data) => {
  if (!data || typeof data !== 'object') return emptyUsageMeta();

  const usage = data.usage && typeof data.usage === 'object' ? data.usage : {};
  const choice0 = Array.isArray(data.choices) ? data.choices[0] : null;

  const inputTokens =
    usage.prompt_tokens != null
      ? Number(usage.prompt_tokens)
      : usage.input_tokens != null
        ? Number(usage.input_tokens)
        : null;
  const outputTokens =
    usage.completion_tokens != null
      ? Number(usage.completion_tokens)
      : usage.output_tokens != null
        ? Number(usage.output_tokens)
        : null;
  const totalTokens = usage.total_tokens != null ? Number(usage.total_tokens) : null;
  const finishReason =
    choice0?.finish_reason != null
      ? String(choice0.finish_reason)
      : choice0?.native_finish_reason != null
        ? String(choice0.native_finish_reason)
        : null;

  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : null,
    costUsd: pickCostUsd(usage),
    finishReason,
  };
};

export const mergeUsageMeta = (existing, incoming) => {
  const base = existing && typeof existing === 'object' ? { ...existing } : emptyUsageMeta();
  if (!incoming || typeof incoming !== 'object') return base;
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'costUsd', 'finishReason']) {
    if (incoming[key] != null) base[key] = incoming[key];
  }
  return base;
};

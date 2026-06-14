/**
 * Normalize OpenRouter (OpenAI-compatible) usage + billing fields from JSON bodies and SSE payloads.
 */

const pickCostUsd = (usage) => {
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

const extractUsageMetaFromCompletionJson = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      costUsd: null,
      finishReason: null,
    };
  }

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

const parseCostUsdFromHeaders = (headers) => {
  if (!headers || typeof headers !== 'object') return null;
  const keys = ['x-openrouter-cost', 'openrouter-cost', 'x-usage-cost'];
  const lowerMap = {};
  for (const k of Object.keys(headers)) {
    lowerMap[String(k).toLowerCase()] = headers[k];
  }
  for (const k of keys) {
    const val = headers[k] ?? lowerMap[k];
    if (val == null) continue;
    const n = parseFloat(String(val));
    if (!Number.isNaN(n)) return n;
  }
  return null;
};

/** Later SSE events override earlier ones when a field is present (e.g. final chunk includes `usage`). */
const mergeUsageMeta = (existing, incoming) => {
  const base =
    existing && typeof existing === 'object'
      ? { ...existing }
      : { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null, finishReason: null };
  if (!incoming || typeof incoming !== 'object') return base;
  for (const k of ['inputTokens', 'outputTokens', 'totalTokens', 'costUsd', 'finishReason']) {
    if (incoming[k] != null) base[k] = incoming[k];
  }
  return base;
};

const parseSseDataLineMeta = (line) => {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (payload === '' || payload === '[DONE]') return null;
  try {
    const json = JSON.parse(payload);
    return extractUsageMetaFromCompletionJson(json);
  } catch {
    return null;
  }
};

/** Parse one SSE `data:` line for usage meta and streaming assistant deltas. */
const parseSseStreamLine = (line) => {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (payload === '' || payload === '[DONE]') return null;
  try {
    const json = JSON.parse(payload);
    const meta = extractUsageMetaFromCompletionJson(json);
    const delta = json.choices?.[0]?.delta?.content;
    const deltaText = typeof delta === 'string' ? delta : '';
    return { meta, deltaText };
  } catch {
    return null;
  }
};

/** Incremental SSE parse without buffering the full stream. */
const createStreamingUsageAccumulator = () => {
  let remainder = '';
  let meta = { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null, finishReason: null };
  let assistantText = '';
  return {
    push(chunk) {
      remainder += chunk.toString('utf8');
      const parts = remainder.split('\n');
      remainder = parts.pop() ?? '';
      for (const line of parts) {
        const parsed = parseSseStreamLine(line);
        if (!parsed) continue;
        meta = mergeUsageMeta(meta, parsed.meta);
        if (parsed.deltaText) assistantText += parsed.deltaText;
      }
    },
    finalize() {
      if (remainder.trim()) {
        const parsed = parseSseStreamLine(remainder);
        if (parsed) {
          meta = mergeUsageMeta(meta, parsed.meta);
          if (parsed.deltaText) assistantText += parsed.deltaText;
        }
      }
      remainder = '';
      return { ...meta, assistantText };
    },
  };
};

/**
 * Consume an OpenRouter chat completions SSE stream: concatenate assistant message text and merge usage metadata.
 */
const accumulateChatCompletionStream = async (readable) =>
  new Promise((resolve, reject) => {
    let remainder = '';
    let fullText = '';
    let meta = { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null, finishReason: null };

    const consumeLine = (rawLine) => {
      const trimmed = String(rawLine || '').trim();
      if (!trimmed.startsWith('data:')) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) fullText += delta;
        meta = mergeUsageMeta(meta, extractUsageMetaFromCompletionJson(json));
      } catch (_) {
        /* partial line handled by newline splitting */
      }
    };

    readable.on('data', (chunk) => {
      remainder += chunk.toString('utf8');
      const parts = remainder.split('\n');
      remainder = parts.pop() ?? '';
      for (const line of parts) consumeLine(line);
    });

    readable.on('end', () => {
      if (remainder.trim()) consumeLine(remainder);
      remainder = '';
      resolve({ fullText: fullText, meta });
    });

    readable.on('error', (err) => reject(err));
  });

module.exports = {
  extractUsageMetaFromCompletionJson,
  parseCostUsdFromHeaders,
  mergeUsageMeta,
  parseSseDataLineMeta,
  parseSseStreamLine,
  createStreamingUsageAccumulator,
  accumulateChatCompletionStream,
};

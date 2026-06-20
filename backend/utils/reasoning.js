// Maps a human-friendly reasoning effort setting to OpenRouter's `reasoning` request option.
// OpenRouter accepts an effort enum (none | minimal | low | medium | high) and decides the
// actual reasoning token budget per model, so callers never pass a raw token count.

const REASONING_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high'];
const DEFAULT_REASONING_EFFORT = 'minimal';

const normalizeReasoningEffort = (value) => {
  const normalized = String(value || '').toLowerCase().trim();
  return REASONING_EFFORT_VALUES.includes(normalized) ? normalized : DEFAULT_REASONING_EFFORT;
};

/**
 * Build the OpenRouter `reasoning` option from a settings effort value.
 * @param {string} effort One of REASONING_EFFORT_VALUES (falls back to the default).
 * @param {object} [opts]
 * @param {boolean} [opts.exclude] When true, reasoning tokens are kept out of the response
 *   content (used so reasoning never leaks into the editor document / parsed JSON).
 */
const buildReasoningOption = (effort, { exclude = false } = {}) => {
  const normalized = normalizeReasoningEffort(effort);
  const reasoning = { effort: normalized };
  if (exclude) reasoning.exclude = true;
  return reasoning;
};

module.exports = {
  REASONING_EFFORT_VALUES,
  DEFAULT_REASONING_EFFORT,
  normalizeReasoningEffort,
  buildReasoningOption,
};

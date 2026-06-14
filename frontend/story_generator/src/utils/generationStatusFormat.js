import { countWordsFromText, estimateTokensFromText } from './textStats';

export const formatCostForStatus = (costUsd) => {
  if (costUsd == null || Number.isNaN(Number(costUsd))) return '—';
  return Number(costUsd).toFixed(5);
};

export const formatGeneratingStatus = ({
  inputTokens,
  outputTokensSoFar,
  inputFileCount,
  model,
}) =>
  `Generating Response: Input Tokens: ${inputTokens}, Output tokens so far: ${outputTokensSoFar}, total Input Files: ${inputFileCount}, Model: ${model}`;

export const formatGenerationCompleteStatus = ({
  inputTokens,
  outputTokens,
  inputWords,
  outputWords,
  model,
  totalCost,
}) =>
  `Generation Complete, Input Tokens: ${inputTokens}, Output Tokens: ${outputTokens}, Input Words: ${inputWords}, Output Words: ${outputWords}, Model: ${model}, Total Cost: ${formatCostForStatus(totalCost)}`;

export const resolveTokenCounts = (usageMeta, promptText, outputText) => {
  const estimatedInput = estimateTokensFromText(promptText);
  const estimatedOutput = estimateTokensFromText(outputText);
  return {
    inputTokens: usageMeta?.inputTokens ?? estimatedInput,
    outputTokens: usageMeta?.outputTokens ?? estimatedOutput,
    inputWords: countWordsFromText(promptText),
    outputWords: countWordsFromText(outputText),
  };
};

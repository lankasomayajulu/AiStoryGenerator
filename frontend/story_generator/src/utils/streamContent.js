export function buildReviseResult(baseText, from, to, replacement) {
  const safeFrom = Math.max(0, Math.min(from, baseText.length));
  const safeTo = Math.max(safeFrom, Math.min(to, baseText.length));
  return baseText.slice(0, safeFrom) + (replacement || '') + baseText.slice(safeTo);
}

export function buildContinueResult(baseText, append) {
  return (baseText || '') + (append || '');
}

export function buildDisplayText({ mode, baseText, generatedResponse, selectionRange }) {
  if (!generatedResponse) return baseText || '';

  if (mode === 'continue') {
    return buildContinueResult(baseText, generatedResponse);
  }

  if (mode === 'revise' && selectionRange) {
    return buildReviseResult(
      baseText,
      selectionRange.from,
      selectionRange.to,
      generatedResponse
    );
  }

  return baseText || '';
}

export function buildPreviewSegments({ mode, baseText, generatedResponse, selectionRange }) {
  if (!mode || !generatedResponse) return null;

  if (mode === 'continue') {
    return [
      { text: baseText || '', type: 'normal' },
      { text: generatedResponse, type: 'highlight' },
    ];
  }

  if (mode === 'revise' && selectionRange) {
    const from = selectionRange.from;
    const to = selectionRange.to;
    return [
      { text: (baseText || '').slice(0, from), type: 'normal' },
      { text: generatedResponse, type: 'highlight' },
      { text: (baseText || '').slice(to), type: 'normal' },
    ];
  }

  return null;
}

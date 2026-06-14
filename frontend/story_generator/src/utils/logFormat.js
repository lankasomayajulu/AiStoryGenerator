export function formatCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (value === Math.floor(value)) return String(value);
    const s = value.toFixed(6).replace(/\.?0+$/, '');
    return s || String(value);
  }
  return String(value);
}

export function formatCost(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    const s = value.toFixed(6).replace(/\.?0+$/, '');
    return s ? `$${s}` : '$0';
  }
  return String(value);
}

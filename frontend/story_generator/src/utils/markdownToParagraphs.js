export function markdownToPlainText(markdown) {
  if (!markdown) return '';
  let text = String(markdown);
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return text;
}

export function markdownToParagraphs(markdown) {
  if (!markdown || !markdown.trim()) return [];

  const plain = markdownToPlainText(markdown).trim();
  if (!plain) return [];

  return plain
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

export function getHeadingSampleFromMarkdown(markdown, maxChars = 1000) {
  const lines = String(markdown || '')
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sample = lines
    .slice(0, 2)
    .map((line) => line.replace(/^#{1,6}\s+/, ''))
    .join('\n');

  return sample.slice(0, maxChars);
}

export function stripLeadingHeading(paragraphs, heading) {
  if (!heading || !paragraphs.length) return paragraphs;
  const normalize = (value) => value.trim().toLowerCase();
  if (normalize(paragraphs[0]) === normalize(heading)) {
    return paragraphs.slice(1);
  }
  return paragraphs;
}

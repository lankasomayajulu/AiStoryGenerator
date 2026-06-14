import { htmlToText } from './htmlToText';

export function htmlToParagraphs(html) {
  if (!html || !html.trim()) return [];

  const div = document.createElement('div');
  div.innerHTML = html;
  const paragraphs = [];

  const blockTags = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) paragraphs.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName?.toLowerCase();
    if (blockTags.has(tag)) {
      const text = node.textContent?.trim();
      if (text) paragraphs.push(text);
      return;
    }

    for (const child of node.childNodes) {
      walk(child);
    }
  };

  for (const child of div.childNodes) {
    walk(child);
  }

  if (paragraphs.length === 0) {
    const plain = htmlToText(html).trim();
    if (plain) {
      return plain
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }

  return paragraphs;
}

export function getHeadingSample(html, maxChars = 1000) {
  const text = htmlToText(html);
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sample = lines.slice(0, 2).join('\n');
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

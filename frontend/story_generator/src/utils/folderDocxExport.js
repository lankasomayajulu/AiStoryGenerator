import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageBreak,
  Packer,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx';
import { saveAs } from 'file-saver';
import { openRouterApi } from '../services/api';
import { extractJsonFromText } from './extractJsonFromText';
import {
  getHeadingSampleFromMarkdown,
  markdownToParagraphs,
  stripLeadingHeading,
} from './markdownToParagraphs';

const HEADING_SYSTEM_PROMPT = `You analyze the opening lines of a document chapter to detect whether they contain a chapter or section heading.

The heading may NOT be formatted as bold or marked up — it may appear as plain text on the first one or two lines.

Respond with ONLY valid JSON in this exact shape:
{"hasHeading": true|false, "heading": "exact heading text or null"}

Rules:
- Only consider the provided excerpt (first lines), not the full chapter.
- If the opening line(s) look like a title or chapter name rather than narrative prose, set hasHeading to true and heading to that text trimmed.
- If the text starts directly with story or narrative content, set hasHeading to false and heading to null.
- Do not invent headings that are not present in the excerpt.`;

async function detectFileHeading(fileName, markdownContent, model) {
  const sample = getHeadingSampleFromMarkdown(markdownContent, 1000);
  if (!sample.trim()) {
    return { hasHeading: false, heading: null };
  }

  try {
    const { data } = await openRouterApi.getResponse(
      [
        { role: 'system', content: HEADING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `File name: ${fileName}\n\nOpening excerpt:\n${sample}`,
        },
      ],
      model,
      {
        max_tokens: 256,
        temperature: 0.1,
        _aiLogOperation: 'folder-export-heading-detect',
      }
    );

    const text = data?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJsonFromText(text);
    if (!parsed || typeof parsed !== 'object') {
      return { hasHeading: false, heading: null };
    }

    const hasHeading = parsed.hasHeading === true;
    const heading =
      typeof parsed.heading === 'string' && parsed.heading.trim()
        ? parsed.heading.trim()
        : null;

    if (hasHeading && heading) {
      return { hasHeading: true, heading };
    }
    return { hasHeading: false, heading: null };
  } catch {
    return { hasHeading: false, heading: null };
  }
}

function bodyParagraphs(markdownContent, headingText, usedFileNameAsHeading) {
  let paragraphs = markdownToParagraphs(markdownContent);
  if (!usedFileNameAsHeading && headingText) {
    paragraphs = stripLeadingHeading(paragraphs, headingText);
  }
  return paragraphs;
}

function sanitizeFilename(name) {
  return String(name || 'export')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function exportFolderToDocx({
  projectName,
  folder,
  files,
  model,
  onProgress,
}) {
  if (!model) {
    throw new Error('No AI model configured. Set a default model in Settings.');
  }
  if (!files?.length) {
    throw new Error('This folder has no files to export.');
  }

  const preparedFiles = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    onProgress?.(`Analyzing headings (${index + 1}/${files.length}): ${file.name}`);

    const detection = await detectFileHeading(file.name, file.content || '', model);
    const usedFileNameAsHeading = !detection.hasHeading || !detection.heading;
    const headingText = usedFileNameAsHeading ? file.name : detection.heading;
    const paragraphs = bodyParagraphs(file.content || '', detection.heading, usedFileNameAsHeading);

    preparedFiles.push({
      headingText,
      paragraphs,
    });
  }

  onProgress?.('Building document…');

  const children = [];

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: projectName || 'Untitled Project',
          bold: true,
          size: 56,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 3600, after: 600 },
    }),
    new Paragraph({
      children: [new PageBreak()],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Table of Contents',
          bold: true,
          size: 32,
        }),
      ],
      spacing: { after: 240 },
    }),
    new TableOfContents('Contents', {
      hyperlink: true,
      headingStyleRange: '1-1',
    }),
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  for (const fileEntry of preparedFiles) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: fileEntry.headingText,
            bold: true,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        spacing: { after: 240 },
      })
    );

    if (fileEntry.paragraphs.length === 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '' })],
        })
      );
    } else {
      for (const paragraphText of fileEntry.paragraphs) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: paragraphText })],
            spacing: { after: 200 },
          })
        );
      }
    }
  }

  const doc = new Document({
    features: {
      updateFields: true,
    },
    sections: [
      {
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${sanitizeFilename(projectName)} - ${sanitizeFilename(folder.name)}.docx`;
  saveAs(blob, filename);
}

export async function loadFolderFileContents(folder, onEnsureFileContent) {
  const loaded = [];

  for (const file of folder.files) {
    let content = file.content;
    if (!file.contentLoaded) {
      if (!onEnsureFileContent) {
        throw new Error('File content is not loaded.');
      }
      content = await onEnsureFileContent(file._id);
    }
    loaded.push({
      ...file,
      content: content || '',
      contentLoaded: true,
    });
  }

  return loaded;
}

import { wrapFileBodyForPrompt } from './contextWrap';

export function flattenProjectFiles(project) {
  if (!project?.folders) return [];
  return project.folders.flatMap((folder) => folder.files || []);
}

/**
 * Outline file: explicit role, or heuristic name match ("Outline").
 */
export function findOutlineFile(project) {
  const files = flattenProjectFiles(project);
  const byRole = files.find((f) => (f.promptRole || 'default') === 'outline');
  if (byRole) return byRole;
  return files.find((f) => {
    const n = String(f.name || '').trim().toLowerCase();
    return n === 'outline' || n.startsWith('outline ') || n.endsWith(' outline') || n.includes('outline');
  });
}

export const PLAN_SCENE_SYSTEM_PROMPT =
  [
    'You are a seasoned fiction-development editor specializing in pacing and continuity.',
    'You receive the story outline, the current drafted manuscript text from the active file, and excerpts from selected context files.',
    'Your single job here is to produce the NEXT scene expressed as sequential bullet beats that move the narrative forward logically from what is written.',
    'Each bullet describes one beat (one focal step in the forthcoming scene); a beat may span one or more sentences in the bullet text.',
    'Stay consistent with genre, continuity, viewpoint, tone, names, and any facts in outline and context.',
    'Do not recap prior scenes verbatim; extrapolate ahead only.',
    'Output markdown only.',
  ].join(' ');

/**
 * Builds the chat user message for “Plan next scene” (non-streaming completion).
 *
 * @param {object} p
 */
export function buildPlanNextSceneUserMessage(p) {
  const {
    project,
    activeFile,
    contentText = '',
    additionalInputTrimmed,
    pointCount,
  } = p;

  if (!project || !activeFile) return '';

  const files = flattenProjectFiles(project);
  const outlineFile = findOutlineFile(project);
  const oid = outlineFile ? outlineFile._id : null;
  const aid = activeFile._id;

  const outlinePlain =
    outlineFile && outlineFile.content != null ? String(outlineFile.content) : '';

  let outlineSection;
  if (outlinePlain.trim()) {
    outlineSection = wrapFileBodyForPrompt({
      name: outlineFile.name || 'Outline',
      content: outlinePlain,
      promptRole: 'outline',
    });
  } else {
    outlineSection =
      '[Outline: Start]\n' +
      '(No outline material was found — mark one file as Outline 📑 or name a file "Outline")\n' +
      '[Outline: End]';
  }

  const activeDraftText =
    contentText !== undefined && contentText !== null
      ? contentText
      : activeFile.content || '';

  const activeSection = wrapFileBodyForPrompt({
    name: activeFile.name || 'Active draft',
    content: activeDraftText || '',
    promptRole: activeFile.promptRole,
  });

  const otherBlocks = [];
  for (const folder of project.folders) {
    for (const file of folder.files || []) {
      if (!file.isSelected || file._id === aid || (oid && file._id === oid)) continue;
      const raw = file.content ? String(file.content) : '';
      if (!raw.trim()) continue;
      otherBlocks.push(
        wrapFileBodyForPrompt({
          name: file.name,
          content: raw,
          promptRole: file.promptRole,
        })
      );
    }
  }

  const supportive =
    otherBlocks.length > 0
      ? `## Additional selected context files\n${otherBlocks.join('\n\n')}`
      : '## Additional selected context files\n(None — only the outline and active draft were supplied.)';

  let optionalSection = '';
  if (additionalInputTrimmed && String(additionalInputTrimmed).trim()) {
    optionalSection = [
      '',
      '## Optional input from author (use unless it contradicts canon above)',
      String(additionalInputTrimmed).trim(),
    ].join('\n');
  } else {
    optionalSection =
      '\n## Optional input from author\n(none supplied — disregard this constraint block.)';
  }

  const n = Number(pointCount);
  const bullets = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 40) : 5;

  return [
    '# Context for planning the next scene',
    '',
    '## Outline (overall story shape so far)',
    outlineSection,
    '',
    '## Current active manuscript file (story generated so far in this chapter/file)',
    activeSection,
    '',
    supportive,
    optionalSection,
    '',
    '---',
    '',
    `# Task`,
    '',
    `Write exactly ${bullets} bullet points for **the immediate next scene** that naturally continues from the current draft while respecting the outline.`,
    `- Use markdown with each line starting "- " followed by one scene beat.`,
    `- Each bullet = one numbered beat toward that next scene (not a synopsis of past text).`,
    `- Each bullet may be one sentence or multiple sentences if needed.`,
    `- Do not prepend labels like "Beat 1"; just use "- "...`,
    '- Output bullets only — no preamble, no closing commentary.',
    '',
    `Produce exactly ${bullets} bullet points.`,
  ].join('\n');
}

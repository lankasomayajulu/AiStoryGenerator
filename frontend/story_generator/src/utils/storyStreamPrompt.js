import { wrapFileBodyForPrompt } from './contextWrap';
import { normalizeFileId, resolveContentOverride } from './normalizeFileId';

export const collectContextFileIds = (project, activeFileId) => {
  if (!project?.folders || !activeFileId) return [];
  const activeId = normalizeFileId(activeFileId);
  const ids = [];

  for (const folder of project.folders) {
    for (const file of folder.files || []) {
      if (file.isSelected && normalizeFileId(file._id) !== activeId) {
        ids.push(file._id);
      }
    }
  }

  return ids;
};

/**
 * Builds the user prompt for Continue / Revise streaming.
 * Matches the original RightPanel.generatePrompt behavior from 23052026 backup.
 */
export const buildStoryStreamPrompt = ({
  project,
  activeFile,
  editor,
  reviseMode = false,
  continuePrompt = '',
  revisePrompt = '',
  selectedText = '',
  selectionRange = { from: 0, to: 0 },
  contentOverrides = {},
  stripHtmlFn = (html) => String(html ?? ''),
}) => {
  if (!project || !activeFile) return '';

  let prompt = '';
  const activeId = normalizeFileId(activeFile._id);

  const resolveFileContent = (file) => {
    const override = resolveContentOverride(contentOverrides, file._id);
    if (override !== undefined) return override;
    return file.content || '';
  };

  const selectedFiles = [];
  for (const folder of project.folders) {
    for (const file of folder.files || []) {
      if (file.isSelected && normalizeFileId(file._id) !== activeId) {
        selectedFiles.push(file);
      }
    }
  }

  for (const file of selectedFiles) {
    const rawContent = resolveFileContent(file);
    if (rawContent) {
      const wrapped = wrapFileBodyForPrompt({
        name: file.name,
        content: stripHtmlFn(rawContent),
        promptRole: file.promptRole,
      });
      prompt += `\n${wrapped}\n`;
    }
  }

  if (reviseMode && selectedText && editor) {
    const fullText = editor.getText();
    const beforeSelection = fullText.substring(0, selectionRange.from);
    const afterSelection = fullText.substring(selectionRange.to);
    prompt += `Story:\n${beforeSelection}[Passage: Start]${selectedText}[Passage: End]${afterSelection}`;
    prompt += revisePrompt;
  } else {
    prompt += continuePrompt;
    const activeContentText = editor
      ? editor.getText()
      : stripHtmlFn(activeFile.content || '');
    prompt += `Story:\n${activeContentText}`;
  }

  return stripHtmlFn(prompt);
};

export const countPromptInputFiles = (project, activeFile) => {
  if (!activeFile) return 0;
  return 1 + collectContextFileIds(project, activeFile._id).length;
};

/**
 * Aligns story file wrapping with Plain Text prompts and GSD context blocks.
 * Roles match SGFile.promptRole stored in MongoDB.
 */

const normalizePromptRole = (role) => {
  const r = String(role || 'default').toLowerCase();
  if (r === 'instructions') return 'instructions';
  if (r === 'scene_details' || r === 'scenedetails') return 'scene_details';
  if (r === 'outline') return 'outline';
  return 'default';
};

const wrapFileBodyForPrompt = ({ name = 'Untitled', content = '', promptRole } = {}) => {
  const text = String(content ?? '');
  const role = normalizePromptRole(promptRole);
  if (role === 'outline') {
    return `[Outline: Start]\n${text}\n[Outline: End]`;
  }
  if (role === 'instructions') {
    return `[Instructions: Start]\n${text}\n[Instructions: End]`;
  }
  if (role === 'scene_details') {
    return `[Scene Details: Start]\n${text}\n[Scene Details: End]`;
  }
  const label = String(name || 'Untitled');
  return `[${label}: Start]\n${text}\n[${label}: End]`;
};

const joinContextBlocks = (blocks = []) => blocks.filter(Boolean).join('\n\n');

module.exports = {
  normalizePromptRole,
  wrapFileBodyForPrompt,
  joinContextBlocks,
};

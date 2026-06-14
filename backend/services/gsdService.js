const mongodbService = require('./mongodbService');
const openRouterService = require('./openRouterService');
const { wrapFileBodyForPrompt, joinContextBlocks } = require('../utils/storyContextTags');

const normalizeMessages = (discussionMessages = []) => {
  if (!Array.isArray(discussionMessages)) return [];
  return discussionMessages
    .filter((m) => m && m.role && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }));
};

const buildContextBlock = async (selectedFileIds = []) => {
  if (!Array.isArray(selectedFileIds) || selectedFileIds.length === 0) {
    return 'No source files selected.';
  }

  const files = await Promise.all(
    selectedFileIds.map(async (fileId) => {
      try {
        const file = await mongodbService.getFileById(fileId);
        if (!file) return null;
        return {
          id: file._id?.toString?.() || String(fileId),
          name: file.Name || 'Untitled',
          content: file.Content || '',
          promptRole: file.promptRole || 'default'
        };
      } catch (error) {
        return null;
      }
    })
  );

  const usable = files.filter(Boolean);
  if (usable.length === 0) {
    return 'No readable source files were found for the selected file ids.';
  }

  const blocks = usable.map((file) =>
    wrapFileBodyForPrompt({
      name: file.name,
      content: file.content,
      promptRole: file.promptRole
    })
  );
  return joinContextBlocks(blocks);
};

const DETAIL_LEVELS = ['brief', 'medium', 'detailed'];

const normalizeDetail = (level) => {
  const l = String(level || 'medium').toLowerCase();
  return DETAIL_LEVELS.includes(l) ? l : 'medium';
};

const beatDepthInstruction = (level) =>
  ({
    brief: 'Scene beats: VERY concise — bullets or 3–6 short lines each; no subplot sprawl.',
    medium: 'Scene beats: moderate — one focused paragraph beat per scene with clear turns.',
    detailed:
      'Scene beats: VERY detailed — emotional beats, conflict micro-turns, blocking, pacing, motifs, sensory notes.'
  }[normalizeDetail(level)]);

const sceneDraftDepthInstruction = (level) =>
  ({
    brief: 'Scene draft prose: lean — essential beats, sparse description, tighter dialogue.',
    medium: 'Scene draft prose: balanced — normal chapter-draft density.',
    detailed:
      'Scene draft prose: rich — fuller interiority, atmosphere, choreography, layered description.'
  }[normalizeDetail(level)]);

const chapterElaborateDepthInstruction = (level) =>
  ({
    brief: 'Final chapter: tightened prose — shorter passages, brisk rhythm.',
    medium: 'Final chapter: standard polished novel depth.',
    detailed: 'Final chapter: richly elaborated prose — immersion, mood, lyrical detail where fitting.'
  }[normalizeDetail(level)]);

const resolveModel = (settings, session, bodyModel, sessionFieldName) => {
  const fromSession =
    sessionFieldName && session && session[sessionFieldName]
      ? String(session[sessionFieldName]).trim()
      : '';
  const fromBody = bodyModel !== undefined && bodyModel !== null ? String(bodyModel).trim() : '';
  return fromBody || fromSession || settings.DefaultModel;
};

const extractJsonFromText = (text = '') => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return null;
    }
  }
};

const sanitizeParts = (parts = []) => {
  if (!Array.isArray(parts)) return [];
  return parts
    .map((part, index) => ({
      partIndex: Number.isFinite(Number(part?.partIndex)) ? Number(part.partIndex) : index + 1,
      title: String(part?.title || `Part ${index + 1}`).trim(),
      objective: String(part?.objective || '').trim(),
      conflict: String(part?.conflict || '').trim(),
      outcome: String(part?.outcome || '').trim()
    }))
    .filter((part) => part.title);
};

const sanitizeScenes = (scenes = [], fallbackPartIndex = null) => {
  if (!Array.isArray(scenes)) return [];
  return scenes
    .map((scene, index) => ({
      partIndex: Number.isFinite(Number(scene?.partIndex))
        ? Number(scene.partIndex)
        : fallbackPartIndex !== null
          ? Number(fallbackPartIndex)
          : 1,
      sceneTitle: String(scene?.sceneTitle || `Scene ${index + 1}`).trim(),
      sceneBeat: String(scene?.sceneBeat || '').trim(),
      draftText: String(scene?.draftText || '').trim()
    }))
    .filter((scene) => scene.sceneTitle);
};

const runDiscuss = async (session, userMessage, options = {}) => {
  const settings = await mongodbService.getSettings();
  if (!settings.ApiKey) {
    throw new Error('API key not configured');
  }

  const model = resolveModel(settings, session, options.model, 'modelDiscuss');

  const contextBlock = await buildContextBlock(session.selectedFileIds);

  const systemMessage = {
    role: 'system',
    content: [
      'You are a story planning assistant.',
      'Help the user plan the next chapter based on context files.',
      'Ask concise clarifying questions when needed, and keep continuity with prior discussion.',
      'Be explicit about assumptions.'
    ].join(' ')
  };

  const discussionHistory = normalizeMessages(session.discussionMessages);
  const messages = [
    systemMessage,
    {
      role: 'user',
      content: `Story context files:\n${contextBlock}`
    },
    ...discussionHistory,
    { role: 'user', content: userMessage }
  ];

  const response = await openRouterService.streamResponseToJson(settings.ApiKey, model, messages, {
    max_tokens: settings.OutputLength,
    temperature: settings.Temperature,
    _requestType: 'GSD',
    _aiLogOperation: 'gsd-discuss'
  });

  const assistantText = response?.choices?.[0]?.message?.content || '';

  const updatedMessages = [
    ...discussionHistory,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantText }
  ];

  return {
    assistantText,
    model,
    updatedMessages,
    raw: response
  };
};

const runGeneratePlan = async (session, options = {}) => {
  const settings = await mongodbService.getSettings();
  if (!settings.ApiKey) {
    throw new Error('API key not configured');
  }

  const model = resolveModel(settings, session, options.model, 'modelPlan');
  const contextBlock = await buildContextBlock(session.selectedFileIds);
  const discussionHistory = normalizeMessages(session.discussionMessages);

  const messages = [
    {
      role: 'system',
      content: [
        'You are a story planner.',
        'Generate a multi-part chapter plan that follows continuity and builds into the next chapter.',
        'Return strictly valid JSON with shape:',
        '{"parts":[{"partIndex":1,"title":"","objective":"","conflict":"","outcome":""}],',
        '"chapterGoal":"","nextChapterIntent":""}.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        `Chapter goal: ${session.chapterGoal || 'Not provided'}`,
        `Next chapter intent: ${session.nextChapterIntent || 'Not provided'}`,
        'Context files:',
        contextBlock
      ].join('\n\n')
    },
    ...discussionHistory
  ];

  const response = await openRouterService.streamResponseToJson(settings.ApiKey, model, messages, {
    max_tokens: settings.OutputLength,
    temperature: settings.Temperature,
    _requestType: 'GSD',
    _aiLogOperation: 'gsd-plan'
  });

  const rawText = response?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonFromText(rawText) || {};
  const parts = sanitizeParts(parsed.parts || []);

  return {
    model,
    raw: response,
    rawText,
    chapterGoal: String(parsed.chapterGoal || session.chapterGoal || '').trim(),
    nextChapterIntent: String(parsed.nextChapterIntent || session.nextChapterIntent || '').trim(),
    parts
  };
};

const runGenerateScenes = async (session, plan, existingScenes = [], targetPartIndex = null, options = {}) => {
  const settings = await mongodbService.getSettings();
  if (!settings.ApiKey) {
    throw new Error('API key not configured');
  }

  const model = resolveModel(settings, session, options.model, 'modelScene');
  const beatLevel = normalizeDetail(options.sceneBeatDetailLevel ?? session.sceneBeatDetailLevel);
  const draftLevel = normalizeDetail(options.sceneDraftDetailLevel ?? session.sceneDraftDetailLevel);

  const contextBlock = await buildContextBlock(session.selectedFileIds);
  const planParts = Array.isArray(plan?.parts) ? plan.parts : [];

  const partsToGenerate =
    targetPartIndex === null
      ? planParts
      : planParts.filter((part) => Number(part.partIndex) === Number(targetPartIndex));

  if (partsToGenerate.length === 0) {
    throw new Error('No plan parts available for scene generation');
  }

  const existingSceneContext = existingScenes
    .map((scene) =>
      [`Part ${scene.partIndex}: ${scene.sceneTitle}`, `Beat: ${scene.sceneBeat || ''}`, `Draft: ${scene.draftText || ''}`].join(
        '\n'
      )
    )
    .join('\n\n');

  const partBlock = partsToGenerate.map((part) => JSON.stringify(part)).join('\n');

  const messages = [
    {
      role: 'system',
      content: [
        'You are a story planner that writes scene drafts from chapter parts.',
        'Return strictly valid JSON with shape:',
        '{"scenes":[{"partIndex":1,"sceneTitle":"","sceneBeat":"","draftText":""}]}',
        'Maintain continuity from previous scenes and context files.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        beatDepthInstruction(beatLevel),
        sceneDraftDepthInstruction(draftLevel),
        `Chapter goal: ${session.chapterGoal || ''}`,
        `Next chapter intent: ${session.nextChapterIntent || ''}`,
        'Plan parts to generate scenes for:',
        partBlock,
        'Existing scenes (for continuity):',
        existingSceneContext || 'None',
        'Context files:',
        contextBlock
      ].join('\n\n')
    }
  ];

  const response = await openRouterService.streamResponseToJson(settings.ApiKey, model, messages, {
    max_tokens: settings.OutputLength,
    temperature: settings.Temperature,
    _requestType: 'GSD',
    _aiLogOperation: 'gsd-scenes'
  });

  const rawText = response?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonFromText(rawText) || {};
  const scenes = sanitizeScenes(parsed.scenes || [], targetPartIndex);

  return {
    model,
    raw: response,
    rawText,
    scenes
  };
};

const runReviseSingleScene = async (session, plan, continuityScenes, targetScene, reviseInstructions, options = {}) => {
  const settings = await mongodbService.getSettings();
  if (!settings.ApiKey) {
    throw new Error('API key not configured');
  }

  if (!reviseInstructions || !String(reviseInstructions).trim()) {
    throw new Error('Revise instructions are required');
  }

  const model = resolveModel(settings, session, options.model, 'modelScene');
  const beatLevel = normalizeDetail(options.sceneBeatDetailLevel ?? session.sceneBeatDetailLevel);
  const draftLevel = normalizeDetail(options.sceneDraftDetailLevel ?? session.sceneDraftDetailLevel);

  const contextBlock = await buildContextBlock(session.selectedFileIds);
  const planParts = Array.isArray(plan?.parts) ? plan.parts : [];
  const matchingPart =
    planParts.find((p) => Number(p.partIndex) === Number(targetScene.partIndex)) || {};

  const continuityBlock = continuityScenes
    .map((scene) =>
      [`Part ${scene.partIndex}: ${scene.sceneTitle}`, `Beat: ${scene.sceneBeat || ''}`, `Draft: ${scene.draftText || ''}`].join(
        '\n'
      )
    )
    .join('\n\n');

  const sceneJson = JSON.stringify({
    partIndex: targetScene.partIndex,
    sceneTitle: targetScene.sceneTitle,
    sceneBeat: targetScene.sceneBeat,
    draftText: targetScene.draftText
  });

  const messages = [
    {
      role: 'system',
      content: [
        'Rewrite ONE scene beat + draft scene based on user instructions.',
        'Return strictly valid JSON with ONE object in array:',
        '{"scenes":[{"partIndex":1,"sceneTitle":"","sceneBeat":"","draftText":""}]}',
        'Keep continuity with neighbouring scenes.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        beatDepthInstruction(beatLevel),
        sceneDraftDepthInstruction(draftLevel),
        `Chapter goal: ${session.chapterGoal || ''}`,
        `Next chapter intent: ${session.nextChapterIntent || ''}`,
        `Plan slice for this part:\n${JSON.stringify(matchingPart)}`,
        'Other scenes for continuity:',
        continuityBlock || 'None',
        'Current scene revision target:',
        sceneJson,
        'User revise instructions:',
        String(reviseInstructions).trim(),
        'Context files:',
        contextBlock
      ].join('\n\n')
    }
  ];

  const response = await openRouterService.streamResponseToJson(settings.ApiKey, model, messages, {
    max_tokens: settings.OutputLength,
    temperature: settings.Temperature,
    _requestType: 'GSD',
    _aiLogOperation: 'gsd-revise-scene'
  });

  const rawText = response?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonFromText(rawText) || {};
  const scenes = sanitizeScenes(parsed.scenes || [], Number(targetScene.partIndex));
  if (!scenes.length) {
    throw new Error('Model returned no revised scene');
  }
  return {
    model,
    raw: response,
    rawText,
    scene: scenes[0]
  };
};

const runElaborateChapter = async (session, plan, scenes = [], options = {}) => {
  const settings = await mongodbService.getSettings();
  if (!settings.ApiKey) {
    throw new Error('API key not configured');
  }

  const model = resolveModel(settings, session, options.model, 'modelElaborate');
  const chapterLevel = normalizeDetail(
    options.chapterDraftDetailLevel ?? session.chapterDraftDetailLevel
  );

  const contextBlock = await buildContextBlock(session.selectedFileIds);
  const planParts = Array.isArray(plan?.parts) ? plan.parts : [];
  const orderedScenes = Array.isArray(scenes)
    ? scenes.slice().sort((a, b) => Number(a.partIndex || 0) - Number(b.partIndex || 0))
    : [];

  if (orderedScenes.length === 0) {
    throw new Error('At least one scene is required to elaborate a chapter');
  }

  const langFromSession = session.chapterTitleLanguage && String(session.chapterTitleLanguage).trim()
    ? String(session.chapterTitleLanguage).trim()
    : '';
  const langFromOptions =
    options.chapterTitleLanguage !== undefined && options.chapterTitleLanguage !== null
      ? String(options.chapterTitleLanguage).trim()
      : '';
  const lang = langFromOptions || langFromSession || 'English';

  const partsBlock = planParts.map((part) => JSON.stringify(part)).join('\n');
  const scenesBlock = orderedScenes
    .map((scene, idx) =>
      [
        `Scene ${idx + 1} | Part ${scene.partIndex}`,
        `Title: ${scene.sceneTitle || ''}`,
        `Beat: ${scene.sceneBeat || ''}`,
        `Draft: ${scene.draftText || ''}`
      ].join('\n')
    )
    .join('\n\n');

  const messages = [
    {
      role: 'system',
      content: [
        'You are a story writing assistant.',
        'Expand scene drafts into a coherent final chapter.',
        chapterElaborateDepthInstruction(chapterLevel),
        'Return strictly valid JSON with shape:',
        '{"chapterTitle":"","finalChapterDraft":"","instructionPack":""}',
        `chapterTitle must be a concise chapter heading IN ${lang} (language requested); no quotes around it if not needed.`,
        'instructionPack summarizes constraints, tone, pacing, unresolved threads for the NEXT edit pass.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        `Chapter goal: ${session.chapterGoal || ''}`,
        `Next chapter intent: ${session.nextChapterIntent || ''}`,
        `Requested chapter-title language: ${lang}`,
        'Approved plan parts:',
        partsBlock || 'None',
        'Scene drafts to elaborate:',
        scenesBlock,
        'Context files:',
        contextBlock
      ].join('\n\n')
    }
  ];

  const response = await openRouterService.streamResponseToJson(settings.ApiKey, model, messages, {
    max_tokens: settings.OutputLength,
    temperature: settings.Temperature,
    _requestType: 'GSD',
    _aiLogOperation: 'gsd-elaborate'
  });

  const rawText = response?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonFromText(rawText) || {};
  const finalChapterDraft = String(parsed.finalChapterDraft || '').trim();
  const instructionPack = String(parsed.instructionPack || '').trim();
  const chapterTitle = String(parsed.chapterTitle || '').trim();

  return {
    model,
    raw: response,
    rawText,
    finalChapterDraft,
    instructionPack,
    chapterTitle
  };
};

const runSuggestContextImprovements = async (session, options = {}) => {
  const settings = await mongodbService.getSettings();
  if (!settings.ApiKey) {
    throw new Error('API key not configured');
  }

  const model = resolveModel(settings, session, options.model, 'modelDiscuss');
  const contextBlock = await buildContextBlock(session.selectedFileIds);

  const messages = [
    {
      role: 'system',
      content: [
        'You help authors organize story project files so an LLM planner receives clearer, complete context.',
        'Project files are injected into prompts using either filename delimiters,',
        'or [Instructions: Start]/[Instructions: End], or [Scene Details: Start]/[Scene Details: End].',
        'Respond with strictly valid JSON matching the schema in the user message.',
        'recommendedPromptRole must be one of: default, instructions, scene_details.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        `Chapter goal: ${session.chapterGoal || 'Not provided'}`,
        `Next chapter intent: ${session.nextChapterIntent || 'Not provided'}`,
        '',
        'Assembled context exactly as the planner will receive it:',
        contextBlock,
        '',
        'Return JSON:',
        '{"notes":"","suggestions":[{"fileId":"","fileName":"","recommendedPromptRole":"default","summary":"","edits":""}]}',
        'fileId must match known project file ids from the context when inferrable; otherwise use empty string.',
        'edits should describe concrete improvements (splitting content, moving instructions, clarifying scene bible, renames).'
      ].join('\n')
    }
  ];

  const response = await openRouterService.streamResponseToJson(settings.ApiKey, model, messages, {
    max_tokens: settings.OutputLength,
    temperature: settings.Temperature,
    _requestType: 'GSD',
    _aiLogOperation: 'gsd-suggest-context'
  });

  const rawText = response?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonFromText(rawText) || {};
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

  return {
    model,
    rawText,
    notes: String(parsed.notes || '').trim(),
    suggestions: suggestions.map((s) => ({
      fileId: String(s?.fileId || '').trim(),
      fileName: String(s?.fileName || '').trim(),
      recommendedPromptRole: String(s?.recommendedPromptRole || 'default').toLowerCase(),
      summary: String(s?.summary || '').trim(),
      edits: String(s?.edits || '').trim()
    }))
  };
};

module.exports = {
  runDiscuss,
  runGeneratePlan,
  sanitizeParts,
  runGenerateScenes,
  sanitizeScenes,
  runReviseSingleScene,
  runElaborateChapter,
  normalizeDetail,
  buildContextBlock,
  runSuggestContextImprovements
};

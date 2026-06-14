const mongodbService = require('../services/mongodbService');
const gsdService = require('../services/gsdService');
const GSDSceneModel = require('../models/GSDScene');

const createSession = async (req, res) => {
  try {
    const { projectId, title } = req.body;
    if (!projectId || !title) {
      return res.status(400).json({ error: 'projectId and title are required' });
    }

    const session = await mongodbService.createGSDSession({
      projectId,
      title
    });

    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSessionsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const sessions = await mongodbService.getGSDSessionsByProject(projectId);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const data = await mongodbService.getGSDSessionFull(sessionId);
    if (!data.session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateSessionContext = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      selectedFileIds,
      chapterGoal,
      nextChapterIntent,
      status,
      chapterTitleLanguage,
      chapterGeneratedTitle,
      sceneBeatDetailLevel,
      sceneDraftDetailLevel,
      chapterDraftDetailLevel,
      modelDiscuss,
      modelPlan,
      modelScene,
      modelElaborate
    } = req.body || {};

    const updates = {};
    if (Array.isArray(selectedFileIds)) updates.selectedFileIds = selectedFileIds;
    if (chapterGoal !== undefined) updates.chapterGoal = chapterGoal;
    if (nextChapterIntent !== undefined) updates.nextChapterIntent = nextChapterIntent;
    if (status !== undefined) updates.status = status;
    if (chapterTitleLanguage !== undefined) updates.chapterTitleLanguage = chapterTitleLanguage;
    if (chapterGeneratedTitle !== undefined) updates.chapterGeneratedTitle = chapterGeneratedTitle;
    if (sceneBeatDetailLevel !== undefined) updates.sceneBeatDetailLevel = sceneBeatDetailLevel;
    if (sceneDraftDetailLevel !== undefined) updates.sceneDraftDetailLevel = sceneDraftDetailLevel;
    if (chapterDraftDetailLevel !== undefined) updates.chapterDraftDetailLevel = chapterDraftDetailLevel;
    if (modelDiscuss !== undefined) updates.modelDiscuss = modelDiscuss;
    if (modelPlan !== undefined) updates.modelPlan = modelPlan;
    if (modelScene !== undefined) updates.modelScene = modelScene;
    if (modelElaborate !== undefined) updates.modelElaborate = modelElaborate;

    const session = await mongodbService.updateGSDSession(sessionId, updates);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const discuss = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, model } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const session = await mongodbService.getGSDSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await gsdService.runDiscuss(session, String(message).trim(), { model });

    await mongodbService.updateGSDSession(sessionId, {
      discussionMessages: result.updatedMessages,
      status: session.status === 'completed' ? 'completed' : 'in_progress'
    });

    await mongodbService.createGSDRunLog({
      sessionId,
      stage: 'discuss',
      requestPayload: { message: String(message).trim() },
      responsePayload: result.raw,
      modelUsed: result.model,
      success: true
    });

    res.json({
      assistantMessage: result.assistantText,
      model: result.model
    });
  } catch (error) {
    await mongodbService.createGSDRunLog({
      sessionId: req.params.sessionId,
      stage: 'discuss',
      requestPayload: req.body || {},
      responsePayload: {},
      modelUsed: '',
      success: false,
      errorMessage: error.message
    }).catch(() => {});

    res.status(500).json({ error: error.message });
  }
};

const generatePlan = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { parts, chapterGoal, nextChapterIntent } = req.body || {};

    const session = await mongodbService.getGSDSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Manual save path: client provides parts directly.
    if (Array.isArray(parts)) {
      const sanitizedParts = gsdService.sanitizeParts(parts);
      const plan = await mongodbService.upsertGSDPlan(sessionId, {
        chapterGoal: chapterGoal !== undefined ? chapterGoal : session.chapterGoal || '',
        nextChapterIntent: nextChapterIntent !== undefined ? nextChapterIntent : session.nextChapterIntent || '',
        parts: sanitizedParts,
        rawModelOutput: ''
      });

      await mongodbService.createGSDRunLog({
        sessionId,
        stage: 'plan',
        requestPayload: { mode: 'manual_save', parts: sanitizedParts },
        responsePayload: plan,
        modelUsed: '',
        success: true
      });

      return res.json({ plan, source: 'manual' });
    }

    // Auto-generate path: model generates structured parts.
    const { model } = req.body || {};
    const result = await gsdService.runGeneratePlan(session, { model });
    const plan = await mongodbService.upsertGSDPlan(sessionId, {
      chapterGoal: result.chapterGoal,
      nextChapterIntent: result.nextChapterIntent,
      parts: result.parts,
      rawModelOutput: result.rawText
    });

    await mongodbService.updateGSDSession(sessionId, {
      chapterGoal: result.chapterGoal,
      nextChapterIntent: result.nextChapterIntent,
      status: session.status === 'completed' ? 'completed' : 'in_progress'
    });

    await mongodbService.createGSDRunLog({
      sessionId,
      stage: 'plan',
      requestPayload: { mode: 'generate' },
      responsePayload: result.raw,
      modelUsed: result.model,
      success: true
    });

    res.json({ plan, source: 'model', model: result.model });
  } catch (error) {
    await mongodbService.createGSDRunLog({
      sessionId: req.params.sessionId,
      stage: 'plan',
      requestPayload: req.body || {},
      responsePayload: {},
      modelUsed: '',
      success: false,
      errorMessage: error.message
    }).catch(() => {});

    res.status(500).json({ error: error.message });
  }
};

const deletePlanParts = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { partIndex } = req.body || {};

    const session = await mongodbService.getGSDSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const isAll = partIndex === undefined || partIndex === null || partIndex === '' || partIndex === 'all';
    const { plan } = await mongodbService.deleteGSDPlanParts(sessionId, isAll ? null : Number(partIndex));

    const refreshedScenes = await mongodbService.getGSDScenesBySession(sessionId);

    await mongodbService.createGSDRunLog({
      sessionId,
      stage: 'plan',
      requestPayload: { mode: 'delete_parts', partIndex: isAll ? 'all' : partIndex },
      responsePayload: { plan, scenes: refreshedScenes },
      modelUsed: '',
      success: true
    });

    res.json({ plan, scenes: refreshedScenes });
  } catch (error) {
    await mongodbService
      .createGSDRunLog({
        sessionId: req.params.sessionId,
        stage: 'plan',
        requestPayload: req.body || {},
        responsePayload: {},
        modelUsed: '',
        success: false,
        errorMessage: error.message
      })
      .catch(() => {});

    res.status(500).json({ error: error.message });
  }
};

const generateScenes = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { scenes, partIndex, model, sceneBeatDetailLevel, sceneDraftDetailLevel } =
      req.body || {};

    const session = await mongodbService.getGSDSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Manual save path
    if (Array.isArray(scenes)) {
      const sanitized = gsdService.sanitizeScenes(scenes, partIndex !== undefined ? Number(partIndex) : null);
      if (partIndex !== undefined) {
        await mongodbService.deleteGSDScenesBySessionAndPart(sessionId, Number(partIndex));
      } else {
        await mongodbService.deleteGSDScenesBySession(sessionId);
      }
      const created = await mongodbService.createManyGSDScenes(
        sanitized.map((scene) => ({
          sessionId,
          partIndex: scene.partIndex,
          sceneTitle: scene.sceneTitle,
          sceneBeat: scene.sceneBeat,
          draftText: scene.draftText,
          rawModelOutput: ''
        }))
      );

      await mongodbService.createGSDRunLog({
        sessionId,
        stage: 'scenes',
        requestPayload: { mode: 'manual_save', partIndex, scenes: sanitized },
        responsePayload: created,
        modelUsed: '',
        success: true
      });

      return res.json({ scenes: created, source: 'manual' });
    }

    const full = await mongodbService.getGSDSessionFull(sessionId);
    if (!full.plan) {
      return res.status(400).json({ error: 'Plan is required before generating scenes' });
    }

    const existingScenes = full.scenes || [];
    const targetPartIndex = partIndex !== undefined ? Number(partIndex) : null;
    const result = await gsdService.runGenerateScenes(session, full.plan, existingScenes, targetPartIndex, {
      model,
      sceneBeatDetailLevel,
      sceneDraftDetailLevel
    });

    if (targetPartIndex !== null) {
      await mongodbService.deleteGSDScenesBySessionAndPart(sessionId, targetPartIndex);
    } else {
      await mongodbService.deleteGSDScenesBySession(sessionId);
    }

    await mongodbService.createManyGSDScenes(
      result.scenes.map((scene) => ({
        sessionId,
        partIndex: scene.partIndex,
        sceneTitle: scene.sceneTitle,
        sceneBeat: scene.sceneBeat,
        draftText: scene.draftText,
        rawModelOutput: result.rawText
      }))
    );

    const refreshedScenes = await mongodbService.getGSDScenesBySession(sessionId);

    await mongodbService.createGSDRunLog({
      sessionId,
      stage: 'scenes',
      requestPayload: { mode: 'generate', partIndex: targetPartIndex },
      responsePayload: result.raw,
      modelUsed: result.model,
      success: true
    });

    res.json({ scenes: refreshedScenes, source: 'model', model: result.model });
  } catch (error) {
    await mongodbService.createGSDRunLog({
      sessionId: req.params.sessionId,
      stage: 'scenes',
      requestPayload: req.body || {},
      responsePayload: {},
      modelUsed: '',
      success: false,
      errorMessage: error.message
    }).catch(() => {});

    res.status(500).json({ error: error.message });
  }
};

const reviseScene = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sceneId, instructions, model, sceneBeatDetailLevel, sceneDraftDetailLevel } =
      req.body || {};
    if (!sceneId) {
      return res.status(400).json({ error: 'sceneId is required' });
    }
    if (!instructions || !String(instructions).trim()) {
      return res.status(400).json({ error: 'instructions are required' });
    }

    const session = await mongodbService.getGSDSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const full = await mongodbService.getGSDSessionFull(sessionId);
    if (!full.plan) {
      return res.status(400).json({ error: 'Plan is required before revising a scene' });
    }

    const target = (full.scenes || []).find((s) => String(s._id) === String(sceneId));
    if (!target) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    const continuity = (full.scenes || []).filter((s) => String(s._id) !== String(sceneId));

    const result = await gsdService.runReviseSingleScene(
      session,
      full.plan,
      continuity,
      target,
      String(instructions).trim(),
      {
        model,
        sceneBeatDetailLevel,
        sceneDraftDetailLevel
      }
    );

    await GSDSceneModel.findByIdAndDelete(sceneId);

    const created = await mongodbService.createGSDScene({
      sessionId,
      partIndex: result.scene.partIndex,
      sceneTitle: result.scene.sceneTitle,
      sceneBeat: result.scene.sceneBeat,
      draftText: result.scene.draftText,
      rawModelOutput: result.rawText,
      dependsOnSceneIds: []
    });

    await mongodbService.createGSDRunLog({
      sessionId,
      stage: 'scenes',
      requestPayload: { mode: 'revise', sceneId, instructions },
      responsePayload: result.raw,
      modelUsed: result.model,
      success: true
    });

    const refreshedScenes = await mongodbService.getGSDScenesBySession(sessionId);
    res.json({ scene: created, scenes: refreshedScenes, model: result.model });
  } catch (error) {
    await mongodbService
      .createGSDRunLog({
        sessionId: req.params.sessionId,
        stage: 'scenes',
        requestPayload: req.body || {},
        responsePayload: {},
        modelUsed: '',
        success: false,
        errorMessage: error.message
      })
      .catch(() => {});

    res.status(500).json({ error: error.message });
  }
};

const toMarkdownPlan = (plan, session) => {
  const parts = Array.isArray(plan?.parts) ? plan.parts : [];
  const lines = [
    `# Chapter Plan - ${session.title}`,
    '',
    `## Chapter Goal`,
    session.chapterGoal || '',
    '',
    `## Next Chapter Intent`,
    session.nextChapterIntent || '',
    '',
    '## Parts'
  ];

  parts.forEach((part) => {
    lines.push(
      '',
      `### Part ${part.partIndex}: ${part.title || ''}`,
      `- Objective: ${part.objective || ''}`,
      `- Conflict: ${part.conflict || ''}`,
      `- Outcome: ${part.outcome || ''}`
    );
  });

  return lines.join('\n');
};

const toMarkdownScenes = (scenes = [], sessionTitle = '') => {
  const sorted = scenes.slice().sort((a, b) => Number(a.partIndex || 0) - Number(b.partIndex || 0));
  const lines = [`# Scene Drafts - ${sessionTitle}`, ''];
  sorted.forEach((scene, idx) => {
    lines.push(
      `## Scene ${idx + 1} (Part ${scene.partIndex})`,
      `### ${scene.sceneTitle || ''}`,
      '',
      `**Beat**: ${scene.sceneBeat || ''}`,
      '',
      scene.draftText || '',
      ''
    );
  });
  return lines.join('\n');
};

const toMarkdownInstructionPack = (session) => {
  return [
    `# Instruction Pack - ${session.title}`,
    '',
    session.instructionPack || ''
  ].join('\n');
};

const toMarkdownChapter = (session) => {
  const heading = session.chapterGeneratedTitle?.trim?.() || session.title;
  return [`# ${heading}`, '', session.finalChapterDraft || ''].join('\n');
};

const elaborateChapter = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      finalChapterDraft,
      instructionPack,
      chapterGeneratedTitle,
      model,
      chapterDraftDetailLevel,
      chapterTitleLanguage
    } = req.body || {};

    const session = await mongodbService.getGSDSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Manual save path
    if (
      finalChapterDraft !== undefined ||
      instructionPack !== undefined ||
      chapterGeneratedTitle !== undefined
    ) {
      const updates = {};
      if (finalChapterDraft !== undefined) {
        updates.finalChapterDraft = String(finalChapterDraft);
      }
      if (instructionPack !== undefined) {
        updates.instructionPack = String(instructionPack);
      }
      if (chapterGeneratedTitle !== undefined) {
        updates.chapterGeneratedTitle = String(chapterGeneratedTitle);
      }
      updates.status = 'completed';
      const updated = await mongodbService.updateGSDSession(sessionId, updates);

      await mongodbService.createGSDRunLog({
        sessionId,
        stage: 'elaborate',
        requestPayload: { mode: 'manual_save' },
        responsePayload: updated,
        modelUsed: '',
        success: true
      });

      return res.json({
        finalChapterDraft: updated.finalChapterDraft || '',
        instructionPack: updated.instructionPack || '',
        chapterGeneratedTitle: updated.chapterGeneratedTitle || '',
        source: 'manual'
      });
    }

    const full = await mongodbService.getGSDSessionFull(sessionId);
    if (!full.plan) {
      return res.status(400).json({ error: 'Plan is required before chapter elaboration' });
    }
    if (!Array.isArray(full.scenes) || full.scenes.length === 0) {
      return res.status(400).json({ error: 'Scenes are required before chapter elaboration' });
    }

    const result = await gsdService.runElaborateChapter(session, full.plan, full.scenes, {
      model,
      chapterDraftDetailLevel,
      chapterTitleLanguage
    });
    const sessionUpdates = {
      finalChapterDraft: result.finalChapterDraft,
      instructionPack: result.instructionPack,
      chapterGeneratedTitle: result.chapterTitle,
      status: 'completed'
    };
    if (chapterTitleLanguage !== undefined && chapterTitleLanguage !== null) {
      const trimmed = String(chapterTitleLanguage).trim();
      if (trimmed) sessionUpdates.chapterTitleLanguage = trimmed;
    }
    const updated = await mongodbService.updateGSDSession(sessionId, sessionUpdates);

    await mongodbService.createGSDRunLog({
      sessionId,
      stage: 'elaborate',
      requestPayload: { mode: 'generate' },
      responsePayload: result.raw,
      modelUsed: result.model,
      success: true
    });

    res.json({
      finalChapterDraft: updated.finalChapterDraft || '',
      instructionPack: updated.instructionPack || '',
      chapterGeneratedTitle: updated.chapterGeneratedTitle || '',
      source: 'model',
      model: result.model
    });
  } catch (error) {
    await mongodbService.createGSDRunLog({
      sessionId: req.params.sessionId,
      stage: 'elaborate',
      requestPayload: req.body || {},
      responsePayload: {},
      modelUsed: '',
      success: false,
      errorMessage: error.message
    }).catch(() => {});

    res.status(500).json({ error: error.message });
  }
};

const previewContextAssembly = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await mongodbService.getGSDSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const previewText = await gsdService.buildContextBlock(session.selectedFileIds || []);

    res.json({
      previewText,
      fileCount: (session.selectedFileIds || []).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const suggestContextImprovements = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { model } = req.body || {};

    const session = await mongodbService.getGSDSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await gsdService.runSuggestContextImprovements(session, { model });

    await mongodbService
      .createGSDRunLog({
        sessionId,
        stage: 'suggest_context',
        requestPayload: { model },
        responsePayload: { notes: result.notes, suggestionCount: result.suggestions.length },
        modelUsed: result.model,
        success: true
      })
      .catch(() => {});

    res.json(result);
  } catch (error) {
    await mongodbService
      .createGSDRunLog({
        sessionId: req.params.sessionId,
        stage: 'suggest_context',
        requestPayload: req.body || {},
        responsePayload: {},
        modelUsed: '',
        success: false,
        errorMessage: error.message
      })
      .catch(() => {});

    res.status(500).json({ error: error.message });
  }
};

const exportArtifacts = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { folderId, fileNames = {} } = req.body || {};
    if (!folderId) {
      return res.status(400).json({ error: 'folderId is required' });
    }

    const session = await mongodbService.getGSDSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const folder = await mongodbService.getFolderById(folderId);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    if (String(folder.projectId) !== String(session.projectId)) {
      return res.status(400).json({ error: 'Folder does not belong to session project' });
    }

    const full = await mongodbService.getGSDSessionFull(sessionId);
    const plan = full.plan;
    const scenes = full.scenes || [];

    const artifacts = [
      {
        key: 'plan',
        fileName: fileNames.plan || 'chapter-plan.md',
        content: toMarkdownPlan(plan, session)
      },
      {
        key: 'scenes',
        fileName: fileNames.scenes || 'scene-details.md',
        content: toMarkdownScenes(scenes, session.title)
      },
      {
        key: 'instructions',
        fileName: fileNames.instructions || 'instructions-pack.md',
        content: toMarkdownInstructionPack(session)
      },
      {
        key: 'chapter',
        fileName: fileNames.chapter || 'chapter-final.md',
        content: toMarkdownChapter(session)
      }
    ];

    const createdFiles = [];
    for (const artifact of artifacts) {
      const created = await mongodbService.createFile(artifact.fileName, folderId);
      const updated = await mongodbService.updateFile(created._id, { Content: artifact.content });
      createdFiles.push({
        key: artifact.key,
        fileId: String(updated._id),
        fileName: artifact.fileName
      });
    }

    await mongodbService.createGSDRunLog({
      sessionId,
      stage: 'export',
      requestPayload: { folderId, fileNames },
      responsePayload: { createdFiles },
      modelUsed: '',
      success: true
    });

    res.json({ createdFiles });
  } catch (error) {
    await mongodbService.createGSDRunLog({
      sessionId: req.params.sessionId,
      stage: 'export',
      requestPayload: req.body || {},
      responsePayload: {},
      modelUsed: '',
      success: false,
      errorMessage: error.message
    }).catch(() => {});

    res.status(500).json({ error: error.message });
  }
};

const notImplementedStage = (stageName) => async (req, res) => {
  res.status(501).json({
    error: `${stageName} is not implemented yet`,
    stage: stageName
  });
};

module.exports = {
  createSession,
  getSessionsByProject,
  getSession,
  updateSessionContext,
  previewContextAssembly,
  suggestContextImprovements,
  discuss,
  generatePlan,
  deletePlanParts,
  generateScenes,
  reviseScene,
  elaborateChapter,
  exportArtifacts
};

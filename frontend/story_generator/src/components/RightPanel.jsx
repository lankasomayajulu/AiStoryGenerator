import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { openRouterApi } from '../services/api';
import { throttle } from '../utils/throttle';
import {
  buildStoryStreamPrompt,
  collectContextFileIds as collectStoryContextFileIds,
  countPromptInputFiles,
} from '../utils/storyStreamPrompt';
import {
  buildPlanNextSceneUserMessage,
  PLAN_SCENE_SYSTEM_PROMPT,
} from '../utils/planScenePrompt';
import { useStatusBar } from '../context/StatusBarContext';
import { estimateTokensFromText } from '../utils/textStats';
import {
  extractUsageMetaFromChunk,
  mergeUsageMeta,
} from '../utils/openRouterStreamUsage';
import {
  formatGeneratingStatus,
  formatGenerationCompleteStatus,
  resolveTokenCounts,
} from '../utils/generationStatusFormat';
import {
  buildContinueResult,
  buildReviseResult,
  buildDisplayText,
  buildPreviewSegments,
} from '../utils/streamContent';
import MarkdownPreview from './MarkdownPreview';
import './RightPanel.css';

const OUTPUT_LENGTH_OPTIONS = [
  { label: 'Very Short', value: 512 },
  { label: 'Short', value: 1024 },
  { label: 'Medium', value: 2048 },
  { label: 'Above Average', value: 4096 },
  { label: 'Long', value: 9192 },
  { label: 'Very Long', value: 18384 },
  { label: 'Extra Long', value: 36768 },
  { label: 'Max', value: 73536 },
  { label: 'Super Max', value: 147072 },
];

const RightPanel = ({
  project,
  activeFile,
  settings,
  savingFile,
  continuePrompt,
  revisePrompt,
  continueSystemPrompt,
  reviseSystemPrompt,
  onContentUpdate,
  onEditorContentChange,
  onSyncActiveFileContent,
  onSaveFile,
  onEnsureFilesContent,
  onSetActiveFile,
  onGenerationDisabledChange,
  onContinuePromptChange,
  onRevisePromptChange,
  onContinueSystemPromptChange,
  onReviseSystemPromptChange,
}) => {
  const [saving, setSaving] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [editorTab, setEditorTab] = useState('plain');
  const [plainTextContent, setPlainTextContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedResponse, setGeneratedResponse] = useState('');
  const [generationMode, setGenerationMode] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState({ from: 0, to: 0 });
  const [previousSelectionRange, setPreviousSelectionRange] = useState({ from: 0, to: 0 });
  const [isReviseMode, setIsReviseMode] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState('');
  const [inputTokens, setInputTokens] = useState(0);
  const [showContinuePromptModal, setShowContinuePromptModal] = useState(false);
  const [showRevisePromptModal, setShowRevisePromptModal] = useState(false);
  const [showContinueSystemPromptModal, setShowContinueSystemPromptModal] = useState(false);
  const [showReviseSystemPromptModal, setShowReviseSystemPromptModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planAdditionalInput, setPlanAdditionalInput] = useState('');
  const [planPointCount, setPlanPointCount] = useState('6');
  const [planOutput, setPlanOutput] = useState('');
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [localContinuePrompt, setLocalContinuePrompt] = useState(continuePrompt);
  const [localRevisePrompt, setLocalRevisePrompt] = useState(revisePrompt);
  const [localContinueSystemPrompt, setLocalContinueSystemPrompt] = useState(continueSystemPrompt);
  const [localReviseSystemPrompt, setLocalReviseSystemPrompt] = useState(reviseSystemPrompt);
  const abortControllerRef = useRef(null);
  const readerRef = useRef(null);
  const previousContentRef = useRef('');
  const generationMetaRef = useRef(null);
  const projectRef = useRef(project);
  const textareaRef = useRef(null);
  const plainTextContentRef = useRef('');
  const STREAM_FLUSH_MS = 150;
  const {
    showStatus,
    clearStatus,
    clearStreamStats,
    setContextItems,
  } = useStatusBar();

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    plainTextContentRef.current = plainTextContent;
  }, [plainTextContent]);

  useEffect(() => {
    setLocalContinuePrompt(continuePrompt);
    setLocalRevisePrompt(revisePrompt);
    setLocalContinueSystemPrompt(continueSystemPrompt);
    setLocalReviseSystemPrompt(reviseSystemPrompt);
  }, [continuePrompt, revisePrompt, continueSystemPrompt, reviseSystemPrompt]);

  const updateWordCounts = useCallback((text) => {
    const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
    setWordCount(words.length);
    setTokenCount(Math.ceil(text.length / 4));
  }, []);

  const syncContent = useCallback(
    (text) => {
      setPlainTextContent(text);
      onContentUpdate(text);
      if (onEditorContentChange) {
        onEditorContentChange(text);
      }
      updateWordCounts(text);
    },
    [onContentUpdate, onEditorContentChange, updateWordCounts]
  );

  const updateSelectionState = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    if (selectionStart !== selectionEnd) {
      const selectedTextContent = textarea.value.substring(selectionStart, selectionEnd);
      setSelectedText(selectedTextContent);
      setSelectionRange({ from: selectionStart, to: selectionEnd });
      setIsReviseMode(true);
      return;
    }

    setSelectedText('');
    setSelectionRange({ from: 0, to: 0 });
    setIsReviseMode(false);
  }, []);

  useEffect(() => {
    if (activeFile) {
      if (!activeFile.contentLoaded) return;

      throttledStreamUpdate.cancel();
      setGenerationMode(null);
      setGeneratedResponse('');
      previousContentRef.current = '';
      setPreviousSelectionRange({ from: 0, to: 0 });
      setSelectedText('');
      setSelectionRange({ from: 0, to: 0 });
      setIsReviseMode(false);

      const newContent = activeFile.content || '';
      syncContent(newContent);
    } else {
      syncContent('');
    }
  }, [activeFile?._id, activeFile?.contentLoaded]);

  const generatePrompt = useCallback(
    (reviseMode = false, contentOverrides = {}, projectSnapshot = projectRef.current) =>
      buildStoryStreamPrompt({
        project: projectSnapshot,
        activeFile,
        contentText: plainTextContentRef.current,
        reviseMode,
        continuePrompt: localContinuePrompt,
        revisePrompt: localRevisePrompt,
        selectedText,
        selectionRange,
        contentOverrides,
      }),
    [activeFile, localContinuePrompt, localRevisePrompt, selectedText, selectionRange]
  );

  const collectContextFileIds = useCallback(
    () => collectStoryContextFileIds(projectRef.current, activeFile?._id),
    [activeFile]
  );

  const isStreamingActive = generating || generatedResponse !== '';

  const getDisplayText = useCallback(() => {
    if (!isStreamingActive) return plainTextContent;
    return buildDisplayText({
      mode: generationMode,
      baseText: previousContentRef.current,
      generatedResponse,
      selectionRange: previousSelectionRange,
    });
  }, [isStreamingActive, plainTextContent, generationMode, generatedResponse, previousSelectionRange]);

  const previewSegments = useMemo(
    () =>
      buildPreviewSegments({
        mode: generationMode,
        baseText: previousContentRef.current,
        generatedResponse,
        selectionRange: previousSelectionRange,
      }),
    [generationMode, generatedResponse, previousSelectionRange]
  );

  const buildPromptTextForEstimate = useCallback((userPrompt, systemPrompt) => {
    const sys = systemPrompt?.trim();
    if (!sys) return userPrompt;
    return `${sys}\n${userPrompt}`;
  }, []);

  const showGeneratingStatus = useCallback(
    (accumulated, usageMeta, meta) => {
      if (!meta) return;
      const inputTokens = usageMeta.inputTokens ?? meta.estimatedInputTokens;
      const outputTokensSoFar =
        usageMeta.outputTokens ?? estimateTokensFromText(accumulated);
      showStatus(
        formatGeneratingStatus({
          inputTokens,
          outputTokensSoFar,
          inputFileCount: meta.inputFileCount,
          model: meta.model,
        }),
        'info',
        { persist: true }
      );
    },
    [showStatus]
  );

  const showGenerationCompleteStatus = useCallback(
    (accumulated, usageMeta, meta) => {
      if (!meta) return;
      const counts = resolveTokenCounts(usageMeta, meta.promptText, accumulated);
      showStatus(
        formatGenerationCompleteStatus({
          ...counts,
          model: meta.model,
          totalCost: usageMeta.costUsd,
        }),
        'success',
        { persist: true }
      );
    },
    [showStatus]
  );

  const endGenerationTracking = useCallback(() => {
    clearStreamStats();
  }, [clearStreamStats]);

  const throttledStreamUpdate = useMemo(
    () =>
      throttle((plainText) => {
        setGeneratedResponse(plainText);
      }, STREAM_FLUSH_MS),
    []
  );

  const throttledGeneratingStatus = useMemo(
    () =>
      throttle((accumulated, usageMeta, meta) => {
        showGeneratingStatus(accumulated, usageMeta, meta);
      }, STREAM_FLUSH_MS),
    [showGeneratingStatus]
  );

  useEffect(
    () => () => {
      throttledStreamUpdate.cancel();
      throttledGeneratingStatus.cancel();
    },
    [throttledStreamUpdate, throttledGeneratingStatus]
  );

  const consumeOpenRouterStream = useCallback(
    async (reader) => {
      const decoder = new TextDecoder();
      let accumulatedResponse = '';
      let hasError = false;
      let usageMeta = extractUsageMetaFromChunk(null);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            if (json.error) {
              const errorMessage = `[ERROR: ${json.error.message || JSON.stringify(json.error)}]`;
              setGeneratedResponse(errorMessage);
              hasError = true;
              break;
            }

            usageMeta = mergeUsageMeta(usageMeta, extractUsageMetaFromChunk(json));

            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
              accumulatedResponse += delta;
              throttledStreamUpdate(accumulatedResponse);
              throttledGeneratingStatus(
                accumulatedResponse,
                usageMeta,
                generationMetaRef.current
              );
            }
          } catch {
            // Ignore parse errors
          }
        }

        if (hasError) break;
      }

      throttledStreamUpdate.flush();
      throttledGeneratingStatus.flush();

      return { accumulatedResponse, usageMeta, hasError };
    },
    [throttledStreamUpdate, throttledGeneratingStatus]
  );

  useEffect(() => {
    if (!activeFile || !settings) {
      setContextItems([]);
      return;
    }

    const outputLengthLabel =
      OUTPUT_LENGTH_OPTIONS.find((opt) => opt.value === settings.OutputLength)?.label ||
      settings.OutputLength;

    setContextItems([
      { label: 'File', value: activeFile.name },
      { label: 'Model', value: settings.DefaultModel || 'Not set' },
      { label: 'Output', value: outputLengthLabel },
      {
        label: 'Temp',
        value: settings.Temperature !== undefined ? settings.Temperature.toFixed(2) : 'N/A',
      },
      { label: 'Words', value: wordCount },
      { label: 'Tokens', value: tokenCount },
    ]);
  }, [activeFile, settings, wordCount, tokenCount, setContextItems]);

  useEffect(() => {
    const isDisabled = generating || generatedResponse !== '';
    if (onGenerationDisabledChange) {
      onGenerationDisabledChange(isDisabled);
    }
  }, [generating, generatedResponse, onGenerationDisabledChange]);

  const persistEditorContent = async (content) => {
    if (!activeFile || !onSaveFile) return;
    await onSaveFile(content);
  };

  const handlePlainTextChange = (event) => {
    syncContent(event.target.value);
    updateSelectionState();
  };

  const handleSave = async () => {
    if (!activeFile) return;

    try {
      setSaving(true);
      clearStatus();
      await persistEditorContent(plainTextContent);
      showStatus('File saved successfully', 'success');
    } catch (error) {
      showStatus('Failed to save file: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const closePlanModal = () => setShowPlanModal(false);

  const cancelPlanModal = () => {
    setPlanAdditionalInput('');
    setPlanPointCount('6');
    setPlanOutput('');
    setShowPlanModal(false);
  };

  const handlePlanSubmit = async () => {
    if (!project || !activeFile || planSubmitting) return;

    const userMsg = buildPlanNextSceneUserMessage({
      project,
      activeFile,
      contentText: plainTextContent,
      additionalInputTrimmed: planAdditionalInput.trim(),
      pointCount: planPointCount,
    });
    setPlanSubmitting(true);
    setPlanOutput('');
    try {
      const { data } = await openRouterApi.getResponse(
        [
          { role: 'system', content: PLAN_SCENE_SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        settings.DefaultModel,
        {
          max_tokens: settings.OutputLength,
          temperature: settings.Temperature,
          _aiLogOperation: 'plan-next-scene',
        }
      );
      const text = data?.choices?.[0]?.message?.content ?? '';
      setPlanOutput(text ? String(text) : '');
    } catch (e) {
      const err =
        e.response?.data?.error ||
        e.response?.data?.message ||
        e.message ||
        String(e);
      setPlanOutput(`[ERROR: ${err}]`);
    } finally {
      setPlanSubmitting(false);
    }
  };

  const handlePromptPreview = async () => {
    try {
      const contentOverrides = onEnsureFilesContent
        ? await onEnsureFilesContent(collectContextFileIds())
        : {};
      const promptText = generatePrompt(isReviseMode, contentOverrides, projectRef.current);
      setPreviewPrompt(promptText);
      setInputTokens(Math.ceil(promptText.length / 4));
      setShowPromptPreview(true);
    } catch (error) {
      showStatus(
        'Failed to build prompt preview: ' + (error.response?.data?.error || error.message),
        'error'
      );
    }
  };

  const handleContinue = async () => {
    if (!activeFile || generating || isReviseMode) return;

    try {
      const contentOverrides = onEnsureFilesContent
        ? await onEnsureFilesContent(collectContextFileIds())
        : {};

      const userPrompt = generatePrompt(false, contentOverrides, projectRef.current);
      const model = settings.DefaultModel;
      const maxTokens = settings.OutputLength;
      const temperature = settings.Temperature;
      const promptText = buildPromptTextForEstimate(userPrompt, continueSystemPrompt);

      clearStatus();
      endGenerationTracking();
      generationMetaRef.current = {
        promptText,
        estimatedInputTokens: estimateTokensFromText(promptText),
        inputFileCount: countPromptInputFiles(projectRef.current, activeFile),
        model: model || 'Not set',
      };
      showGeneratingStatus('', extractUsageMetaFromChunk(null), generationMetaRef.current);

      setGenerating(true);
      const baseText = plainTextContentRef.current;
      previousContentRef.current = baseText;
      setGenerationMode('continue');
      throttledStreamUpdate.cancel();
      throttledGeneratingStatus.cancel();
      setPreviousSelectionRange({ from: 0, to: 0 });
      setGeneratedResponse('');

      abortControllerRef.current = new AbortController();

      const response = await openRouterApi.getStreamingResponse(
        userPrompt,
        model,
        maxTokens,
        temperature,
        continueSystemPrompt,
        abortControllerRef.current.signal,
        { useGsd: !!settings.UseGsdForStreaming }
      );

      if (!response.ok) {
        let errorMessage = 'Failed to get response from API';
        try {
          const errorData = await response.text();
          const errorJson = JSON.parse(errorData);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        const errorText = `[ERROR: ${errorMessage}]`;
        setGeneratedResponse(errorText);
        showStatus(errorMessage, 'error');
        setGenerating(false);
        endGenerationTracking();
        return;
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const { accumulatedResponse, usageMeta, hasError } = await consumeOpenRouterStream(reader);

      if (!hasError && accumulatedResponse && !accumulatedResponse.startsWith('[ERROR:')) {
        showGenerationCompleteStatus(
          accumulatedResponse,
          usageMeta,
          generationMetaRef.current
        );
      } else if (hasError) {
        showStatus('Generation failed', 'error');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setGenerating(false);
        clearStatus();
        endGenerationTracking();
        return;
      }
      const errorMessage = `[ERROR: ${error.message}]`;
      throttledStreamUpdate.flush();
      throttledStreamUpdate(errorMessage);
      showStatus(error.message, 'error');
      setGenerating(false);
      endGenerationTracking();
      return;
    } finally {
      setGenerating(false);
      readerRef.current = null;
      abortControllerRef.current = null;
      endGenerationTracking();
    }
  };

  const handleRevise = async () => {
    if (!activeFile || generating || !isReviseMode || !selectedText) return;

    try {
      const contentOverrides = onEnsureFilesContent
        ? await onEnsureFilesContent(collectContextFileIds())
        : {};

      const storedRange = { ...selectionRange };
      setPreviousSelectionRange(storedRange);
      setGenerationMode('revise');
      throttledStreamUpdate.cancel();
      throttledGeneratingStatus.cancel();
      setGeneratedResponse('');

      previousContentRef.current = plainTextContentRef.current;

      const userPrompt = generatePrompt(true, contentOverrides, projectRef.current);
      const model = settings.DefaultModel;
      const maxTokens = settings.OutputLength;
      const temperature = settings.Temperature;
      const promptText = buildPromptTextForEstimate(userPrompt, reviseSystemPrompt);

      clearStatus();
      endGenerationTracking();
      generationMetaRef.current = {
        promptText,
        estimatedInputTokens: estimateTokensFromText(promptText),
        inputFileCount: countPromptInputFiles(projectRef.current, activeFile),
        model: model || 'Not set',
      };
      showGeneratingStatus('', extractUsageMetaFromChunk(null), generationMetaRef.current);

      setGenerating(true);

      abortControllerRef.current = new AbortController();

      const response = await openRouterApi.getStreamingResponse(
        userPrompt,
        model,
        maxTokens,
        temperature,
        reviseSystemPrompt,
        abortControllerRef.current.signal,
        { useGsd: !!settings.UseGsdForStreaming }
      );

      if (!response.ok) {
        let errorMessage = 'Failed to get response from API';
        try {
          const errorData = await response.text();
          const errorJson = JSON.parse(errorData);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        const errorText = `[ERROR: ${errorMessage}]`;
        setGeneratedResponse(errorText);
        showStatus(errorMessage, 'error');
        setGenerating(false);
        endGenerationTracking();
        return;
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const { accumulatedResponse, usageMeta, hasError } = await consumeOpenRouterStream(reader);

      if (!hasError && accumulatedResponse && !accumulatedResponse.startsWith('[ERROR:')) {
        showGenerationCompleteStatus(
          accumulatedResponse,
          usageMeta,
          generationMetaRef.current
        );
      } else if (hasError) {
        showStatus('Generation failed', 'error');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setGenerating(false);
        clearStatus();
        endGenerationTracking();
        return;
      }
      const errorMessage = `[ERROR: ${error.message}]`;
      throttledStreamUpdate.flush();
      throttledStreamUpdate(errorMessage);
      showStatus(error.message, 'error');
      setGenerating(false);
      endGenerationTracking();
      return;
    } finally {
      setGenerating(false);
      readerRef.current = null;
      abortControllerRef.current = null;
      endGenerationTracking();
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (readerRef.current) {
      readerRef.current.cancel();
    }
    setGenerating(false);
    clearStatus();
    endGenerationTracking();
  };

  const finalizeGenerationState = () => {
    throttledStreamUpdate.cancel();
    setGenerationMode(null);
    setGeneratedResponse('');
    previousContentRef.current = '';
    setPreviousSelectionRange({ from: 0, to: 0 });
    setSelectedText('');
    setSelectionRange({ from: 0, to: 0 });
    setIsReviseMode(false);
  };

  const buildAcceptedContent = () => {
    const baseText = previousContentRef.current;

    if (generationMode === 'revise') {
      const { from, to } = previousSelectionRange;
      return buildReviseResult(baseText, from, to, generatedResponse);
    }

    if (generationMode === 'continue') {
      return buildContinueResult(baseText, generatedResponse);
    }

    return plainTextContentRef.current;
  };

  const handleAccept = async () => {
    if (!activeFile || !generatedResponse) return;

    try {
      setSaving(true);
      const finalContent = buildAcceptedContent();
      syncContent(finalContent);
      await persistEditorContent(finalContent);
      finalizeGenerationState();
      clearStatus();
    } catch (error) {
      showStatus('Failed to save file: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!activeFile || !generatedResponse) return;

    try {
      setSaving(true);
      const restoreContent = previousContentRef.current;
      syncContent(restoreContent);
      await persistEditorContent(restoreContent);
      finalizeGenerationState();
      clearStatus();
    } catch (error) {
      showStatus('Failed to restore file: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!activeFile) {
    return (
      <div className="right-panel">
        <div className="no-file-selected">
          <p>No file selected. Select a file from the left panel to start editing.</p>
        </div>
      </div>
    );
  }

  const outputLengthLabel =
    OUTPUT_LENGTH_OPTIONS.find((opt) => opt.value === settings.OutputLength)?.label ||
    settings.OutputLength;

  return (
    <div className="right-panel">
      {savingFile && (
        <div className="saving-overlay">
          <div className="saving-spinner">Saving file...</div>
        </div>
      )}

      <div className="buttons-pane">
        <button
          className="btn-prompt-preview"
          onClick={handlePromptPreview}
          title="Preview Prompt"
          disabled={generating || generatedResponse !== ''}
        >
          🔍
        </button>
        <button
          type="button"
          className="btn-plan-scene"
          onClick={() => setShowPlanModal(true)}
          title="Plan next scene (outline + selected files + active draft)"
          disabled={!settings?.DefaultModel}
        >
          Plan
        </button>
        <button
          className="btn-continue"
          onClick={handleContinue}
          title="Continue writing"
          disabled={generating || generatedResponse !== '' || isReviseMode}
        >
          Continue
        </button>
        <button
          className="btn-revise"
          onClick={handleRevise}
          title="Revise selected text"
          disabled={generating || generatedResponse !== '' || !isReviseMode}
        >
          Revise
        </button>
        <button
          className="btn-cancel"
          onClick={handleCancel}
          title="Cancel generation"
          disabled={!generating}
        >
          Cancel
        </button>
        <button
          className="btn-accept"
          onClick={handleAccept}
          title="Accept response"
          disabled={!generatedResponse || generating}
        >
          👍
        </button>
        <button
          className="btn-reject"
          onClick={handleReject}
          title="Reject response"
          disabled={!generatedResponse || generating}
        >
          👎
        </button>
        <button
          className="btn-save"
          onClick={handleSave}
          disabled={saving || generating || generatedResponse !== ''}
          title="Save file"
        >
          {saving ? '…' : 'Save'}
        </button>
        <button
          className="btn-prompt-continue"
          onClick={() => setShowContinuePromptModal(true)}
          title="Edit Continue Prompt"
          disabled={generating || generatedResponse !== ''}
        >
          C prompt
        </button>
        <button
          className="btn-prompt-revise"
          onClick={() => setShowRevisePromptModal(true)}
          title="Edit Revise Prompt"
          disabled={generating || generatedResponse !== ''}
        >
          R prompt
        </button>
        <button
          className="btn-prompt-continue"
          onClick={() => setShowContinueSystemPromptModal(true)}
          title="Edit Continue System Prompt"
          disabled={generating || generatedResponse !== ''}
        >
          C system
        </button>
        <button
          className="btn-prompt-revise"
          onClick={() => setShowReviseSystemPromptModal(true)}
          title="Edit Revise System Prompt"
          disabled={generating || generatedResponse !== ''}
        >
          R system
        </button>
      </div>

      <div className="editor-tabs">
        <button
          type="button"
          className={`editor-tab ${editorTab === 'plain' ? 'active' : ''}`}
          onClick={() => setEditorTab('plain')}
        >
          Plain Text
        </button>
        <button
          type="button"
          className={`editor-tab ${editorTab === 'preview' ? 'active' : ''}`}
          onClick={() => setEditorTab('preview')}
        >
          Preview
        </button>
      </div>

      <div className="editor-container">
        {editorTab === 'plain' ? (
          <textarea
            ref={textareaRef}
            className="markdown-textarea"
            value={getDisplayText()}
            onChange={handlePlainTextChange}
            onSelect={updateSelectionState}
            onMouseUp={updateSelectionState}
            onKeyUp={updateSelectionState}
            placeholder="Start writing your story in markdown..."
            spellCheck
            readOnly={isStreamingActive}
          />
        ) : (
          <MarkdownPreview
            content={plainTextContent}
            segments={previewSegments}
            className="markdown-preview-pane"
          />
        )}
      </div>

      {showPromptPreview && (
        <div className="modal-overlay" onClick={() => setShowPromptPreview(false)}>
          <div className="modal-content prompt-preview-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Prompt Preview</h4>
            <div className="prompt-preview-content">
              <pre className="prompt-text">{previewPrompt}</pre>
            </div>
            <div className="prompt-preview-info">
              <p><strong>Model:</strong> {settings.DefaultModel}</p>
              <p><strong>Output Length:</strong> {outputLengthLabel} ({settings.OutputLength})</p>
              <p><strong>Temperature:</strong> {settings.Temperature}</p>
              <p><strong>Input Tokens:</strong> {inputTokens}</p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowPromptPreview(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showContinuePromptModal && (
        <div className="modal-overlay" onClick={() => setShowContinuePromptModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4>Continue Prompt</h4>
            <textarea
              value={localContinuePrompt}
              onChange={(e) => setLocalContinuePrompt(e.target.value)}
              rows={10}
              className="prompt-textarea"
            />
            <div className="modal-actions">
              <button onClick={() => {
                if (onContinuePromptChange) {
                  onContinuePromptChange(localContinuePrompt);
                }
                setShowContinuePromptModal(false);
              }}>Save</button>
              <button onClick={() => setShowContinuePromptModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showRevisePromptModal && (
        <div className="modal-overlay" onClick={() => setShowRevisePromptModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4>Revise Prompt</h4>
            <textarea
              value={localRevisePrompt}
              onChange={(e) => setLocalRevisePrompt(e.target.value)}
              rows={10}
              className="prompt-textarea"
            />
            <div className="modal-actions">
              <button onClick={() => {
                if (onRevisePromptChange) {
                  onRevisePromptChange(localRevisePrompt);
                }
                setShowRevisePromptModal(false);
              }}>Save</button>
              <button onClick={() => setShowRevisePromptModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showContinueSystemPromptModal && (
        <div className="modal-overlay" onClick={() => setShowContinueSystemPromptModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4>Continue System Prompt</h4>
            <textarea
              value={localContinueSystemPrompt}
              onChange={(e) => setLocalContinueSystemPrompt(e.target.value)}
              rows={10}
              className="prompt-textarea"
            />
            <div className="modal-actions">
              <button onClick={() => {
                if (onContinueSystemPromptChange) {
                  onContinueSystemPromptChange(localContinueSystemPrompt);
                }
                setShowContinueSystemPromptModal(false);
              }}>Save</button>
              <button onClick={() => setShowContinueSystemPromptModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showReviseSystemPromptModal && (
        <div className="modal-overlay" onClick={() => setShowReviseSystemPromptModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4>Revise System Prompt</h4>
            <textarea
              value={localReviseSystemPrompt}
              onChange={(e) => setLocalReviseSystemPrompt(e.target.value)}
              rows={10}
              className="prompt-textarea"
            />
            <div className="modal-actions">
              <button onClick={() => {
                if (onReviseSystemPromptChange) {
                  onReviseSystemPromptChange(localReviseSystemPrompt);
                }
                setShowReviseSystemPromptModal(false);
              }}>Save</button>
              <button onClick={() => setShowReviseSystemPromptModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPlanModal && (
        <div className="modal-overlay plan-modal-overlay" onClick={closePlanModal}>
          <div
            className="modal-content plan-modal-content"
            role="dialog"
            aria-labelledby="plan-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="plan-modal-header">
              <h4 id="plan-modal-title">Plan next scene</h4>
              <button
                type="button"
                className="plan-modal-close"
                onClick={closePlanModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="plan-modal-hint">
              Uses the Outline file (📑 or name match), this editor draft, and other selected project files as context.
            </p>
            <label className="plan-field-label" htmlFor="plan-input-textarea">
              Input (optional)
            </label>
            <textarea
              id="plan-input-textarea"
              className="plan-textarea"
              rows={6}
              value={planAdditionalInput}
              onChange={(e) => setPlanAdditionalInput(e.target.value)}
              placeholder="Extra direction for the next scene — leave empty to ignore"
              disabled={planSubmitting}
            />
            <label className="plan-field-label" htmlFor="plan-point-count">
              Number of bullet beats
            </label>
            <input
              id="plan-point-count"
              type="number"
              className="plan-number-input"
              min={1}
              max={40}
              value={planPointCount}
              onChange={(e) => setPlanPointCount(e.target.value)}
              disabled={planSubmitting}
            />
            <label className="plan-field-label" htmlFor="plan-output-textarea">
              Output
            </label>
            {planSubmitting ? (
              <p className="plan-generating" aria-live="polite">
                Generating…
              </p>
            ) : null}
            <textarea
              id="plan-output-textarea"
              className="plan-textarea plan-output-textarea"
              rows={12}
              value={planOutput}
              onChange={(e) => setPlanOutput(e.target.value)}
              disabled={planSubmitting}
              placeholder="Scene beats appear here after Submit"
            />
            <div className="modal-actions plan-modal-actions">
              <button
                type="button"
                onClick={handlePlanSubmit}
                disabled={planSubmitting || !settings?.DefaultModel}
              >
                {planSubmitting ? '…' : 'Submit'}
              </button>
              <button type="button" onClick={cancelPlanModal} disabled={planSubmitting}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RightPanel;

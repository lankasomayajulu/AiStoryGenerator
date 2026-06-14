import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '../extensions/FontFamily';
import FontSize from '../extensions/FontSize';
import Color from '../extensions/Color';
import Highlight from '../extensions/Highlight';
import TextAlign from '../extensions/TextAlign';
import Underline from '../extensions/Underline';
import { openRouterApi } from '../services/api';
import { htmlToText } from '../utils/htmlToText';
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
import { countWordsFromText, estimateTokensFromText } from '../utils/textStats';
import {
  extractUsageMetaFromChunk,
  mergeUsageMeta,
} from '../utils/openRouterStreamUsage';
import {
  formatGeneratingStatus,
  formatGenerationCompleteStatus,
  resolveTokenCounts,
} from '../utils/generationStatusFormat';
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
  const [reviseContent, setReviseContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedResponse, setGeneratedResponse] = useState('');
  const [previousContent, setPreviousContent] = useState('');
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
  const reviseContentRef = useRef('');
  const previousContentRef = useRef('');
  const streamModeRef = useRef(null);
  const generationMetaRef = useRef(null);
  const projectRef = useRef(project);
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

  // Update local prompts when props change
  useEffect(() => {
    setLocalContinuePrompt(continuePrompt);
    setLocalRevisePrompt(revisePrompt);
    setLocalContinueSystemPrompt(continueSystemPrompt);
    setLocalReviseSystemPrompt(reviseSystemPrompt);
  }, [continuePrompt, revisePrompt, continueSystemPrompt, reviseSystemPrompt]);

  // Helper: escape content for safe use inside HTML tags
  const escapeForHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Convert AI plain text to HTML: remove specific unwanted special symbols and respect markdown-style formatting
  const textToHtml = (text) => {
    if (!text) return '';
    let s = String(text);
    // 1. Replace multiple dots in one place with a single dot
    s = s.replace(/\.{2,}/g, '.');
    // 2. Remove only the specific unwanted special symbols (keeps other languages like Telugu intact)
    s = s.replace(/[?`\[\]\^@&\$!]/g, '');
    // 3. Convert markdown-style rich text (order matters: ** and __ before * and _)
    // **bold** -> <strong>
    s = s.replace(/\*\*([^*]*)\*\*/g, (_, content) => '<strong>' + escapeForHtml(content) + '</strong>');
    // __bold__
    s = s.replace(/__([^_]*)__/g, (_, content) => '<strong>' + escapeForHtml(content) + '</strong>');
    // *italic* (single asterisk, not part of **)
    s = s.replace(/(?<!\*)\*([^*]*)\*(?!\*)/g, (_, content) => '<em>' + escapeForHtml(content) + '</em>');
    // _italic_ (single underscore, not part of __)
    s = s.replace(/(?<!_)_([^_]*)_(?!_)/g, (_, content) => '<em>' + escapeForHtml(content) + '</em>');
    // `code` -> <code>
    s = s.replace(/`([^`]*)`/g, (_, content) => '<code>' + escapeForHtml(content) + '</code>');
    // 4. Newlines to <br> (no global escape here; < > were stripped in step 2, tag content already escaped)
    return s.replace(/\n/g, '<br>');
  };

  const stripHtml = (html) => {
    let text = html;
    // Replace <br> with a single newline
    text = text.replace(/<br\s*\/?>/gi, "\n");
    // Replace closing paragraph and div tags with double newlines for spacing
    text = text.replace(/<\/p>|<\/div>/gi, "\n\n");
    // Strip all remaining HTML tags
    text = text.replace(/<[^>]+>/g, "");
    var div = document.createElement("div");
    div.innerHTML = text;
    return div.innerText || "";
  }

  const updateSelectionState = (ed) => {
    if (!ed) return;
    const { from, to, empty } = ed.state.selection;
    if (!empty && from !== to) {
      const selectedTextContent = ed.state.doc.textBetween(from, to);
      setSelectedText(selectedTextContent);
      setSelectionRange({ from, to });
      setIsReviseMode(true);
      return;
    }

    setSelectedText('');
    setSelectionRange({ from: 0, to: 0 });
    setIsReviseMode(false);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight,
      TextAlign,
      Underline,
      Placeholder.configure({
        placeholder: 'Start writing your story...',
      }),
    ],
    content: activeFile?.content || '',
    editorProps: {
      attributes: {
        style: 'font-family: Open Sans; font-size: 18px; min-height: 100%; outline: none;',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onContentUpdate(html);
      if (onEditorContentChange) {
        onEditorContentChange(html);
      }

      const text = editor.getText();
      const words = text.trim().split(/\s+/).filter(word => word.length > 0);
      setWordCount(words.length);
      setTokenCount(Math.ceil(text.length / 4));

      // Keep selection/mode in sync even when doc changes
      updateSelectionState(editor);
    },
    // IMPORTANT: selecting text does not trigger onUpdate; track selection changes explicitly
    onSelectionUpdate: ({ editor }) => {
      updateSelectionState(editor);
    },
  });

  useEffect(() => {
    if (editor && activeFile) {
      if (!activeFile.contentLoaded) return;

      const newContent = activeFile.content || '';
      editor.commands.setContent(newContent, false);
      if (onEditorContentChange) {
        onEditorContentChange(newContent);
      }

      requestAnimationFrame(() => {
        if (!editor || editor.isDestroyed) return;
        const text = editor.getText();
        const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
        setWordCount(words.length);
        setTokenCount(Math.ceil(text.length / 4));
      });
    } else if (editor && !activeFile) {
      editor.commands.setContent('', false);
      if (onEditorContentChange) {
        onEditorContentChange('');
      }
      setWordCount(0);
      setTokenCount(0);
    }
  }, [activeFile?._id, activeFile?.contentLoaded, editor]);

  const generatePrompt = useCallback(
    (reviseMode = false, contentOverrides = {}, projectSnapshot = projectRef.current) =>
      buildStoryStreamPrompt({
        project: projectSnapshot,
        activeFile,
        editor,
        reviseMode,
        continuePrompt: localContinuePrompt,
        revisePrompt: localRevisePrompt,
        selectedText,
        selectionRange,
        contentOverrides,
        stripHtmlFn: stripHtml,
      }),
    [
      activeFile,
      editor,
      localContinuePrompt,
      localRevisePrompt,
      selectedText,
      selectionRange,
    ]
  );

  const collectContextFileIds = useCallback(
    () => collectStoryContextFileIds(projectRef.current, activeFile?._id),
    [activeFile]
  );

  const insertHtmlByClass = (htmlString, targetClass, newHtmlContent) => {
    if (!htmlString) return "";
  
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
  
    const span = doc.querySelector(`span.${targetClass}`);
  
    if (span) {
      // Using innerHTML instead of textContent allows the inserted string 
      // to be treated as actual HTML elements
      span.innerHTML = newHtmlContent;
    }
  
    return doc.body.innerHTML;
  };

  const applyStreamToEditor = useCallback(
    (plainText) => {
      if (!editor || editor.isDestroyed || !plainText) return;

      const htmlResponse = textToHtml(plainText);
      const mode = streamModeRef.current;

      if (mode === 'revise') {
        const baseHtml = reviseContentRef.current;
        if (!baseHtml) return;
        const newContent = insertHtmlByClass(baseHtml, 'revise-content-start', htmlResponse);
        editor.commands.setContent(newContent, false);
        if (onEditorContentChange) onEditorContentChange(newContent);
        return;
      }

      if (mode === 'continue') {
        const baseHtml = previousContentRef.current;
        const newContent =
          baseHtml + `<span style="background-color: #e0e0e0;">${htmlResponse}</span>`;
        editor.commands.setContent(newContent, false);
        if (onEditorContentChange) onEditorContentChange(newContent);
      }
    },
    [editor, onEditorContentChange]
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
        applyStreamToEditor(plainText);
        setGeneratedResponse(plainText);
      }, STREAM_FLUSH_MS),
    [applyStreamToEditor]
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

  // Notify parent of disabled state
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

  const handleSave = async () => {
    if (!activeFile || !editor) return;

    try {
      setSaving(true);
      const content = editor.getHTML();
      clearStatus();
      await persistEditorContent(content);
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
    if (!project || !activeFile || !editor || planSubmitting) return;

    const userMsg = buildPlanNextSceneUserMessage(
      {
        project,
        activeFile,
        editor,
        additionalInputTrimmed: planAdditionalInput.trim(),
        pointCount: planPointCount,
      },
      stripHtml
    );
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
      setInputTokens(Math.ceil(htmlToText(promptText).length / 4));
      setShowPromptPreview(true);
    } catch (error) {
      showStatus(
        'Failed to build prompt preview: ' + (error.response?.data?.error || error.message),
        'error'
      );
    }
  };

  const handleContinue = async () => {
    if (!activeFile || !editor || generating || isReviseMode) return;

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
      const baseHtml = editor.getHTML();
      previousContentRef.current = baseHtml;
      setPreviousContent(baseHtml);
      streamModeRef.current = 'continue';
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
      streamModeRef.current = null;
      setGenerating(false);
      readerRef.current = null;
      abortControllerRef.current = null;
      endGenerationTracking();
    }
  };

  const addReviseMarkers = (editor, from, to) => {
    try {
      if(!editor) return;
      const currentHtml = editor.getHTML();
      setPreviousContent(currentHtml);
      editor.chain()
      .focus()
      .insertContentAt(to, ' [OriginalContent: End]')
      .insertContentAt(from, '[OriginalContent: Start] ')
      .run();
  
      let revisedHtml = editor.getHTML();
      revisedHtml = revisedHtml.replace(/\[OriginalContent: Start\]/g, '<span class="original-content-start" style="background-color: #909090;">')
        .replace(/\[OriginalContent: End\]/g, '</span><br><span class="revise-content-start" style="background-color: #e0e0e0;"></span>');
      reviseContentRef.current = revisedHtml;
      setReviseContent(revisedHtml);
      editor.commands.setContent(revisedHtml, false);

    } catch (error) {
      console.error('Error adding revise markers:', error);
      editor.commands.setContent(previousContent);
      if(onEditorContentChange) {
        onEditorContentChange(previousContent);
      }
    }
    

  }

  const handleRevise = async () => {
    if (!activeFile || !editor || generating || !isReviseMode || !selectedText) return;

    try {
      const contentOverrides = onEnsureFilesContent
        ? await onEnsureFilesContent(collectContextFileIds())
        : {};

      const storedRange = { ...selectionRange };
      setPreviousSelectionRange(storedRange);
      streamModeRef.current = 'revise';
      throttledStreamUpdate.cancel();
      throttledGeneratingStatus.cancel();
      setGeneratedResponse('');

      // Insert the marker using TipTap at the stored document position
      try {
        const from = Math.max(0, Math.min(storedRange.from, editor.state.doc.content.size));
        const to = Math.max(0, Math.min(storedRange.to, editor.state.doc.content.size));
        addReviseMarkers(editor, from, to);
      } catch (error) {
        console.error('Error inserting revise marker:', error);
        setGenerating(false);
        clearStatus();
        endGenerationTracking();
        return;
      }

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
      const currentHtml = editor.getHTML();
      previousContentRef.current = currentHtml;
      setPreviousContent(currentHtml);

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
      streamModeRef.current = null;
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
    // Keep generatedResponse so user can accept/reject partial content
  };

  const removeSpecificSpan = (htmlString, targetClass) => {
    // 1. Parse the string into a DOM document
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    // 2. Find all spans with the specific class
    const spans = doc.querySelectorAll(`span.${targetClass}`);

    spans.forEach(span => {
      // Move all children of the span to the parent node, right before the span itself
      while (span.firstChild) {
        span.parentNode.insertBefore(span.firstChild, span);
      }
      // Remove the now-empty span
      span.remove();
    });

    // 3. Return the modified HTML (body content only)
    return doc.body.innerHTML;
  }


  const removeSpanAndContent = (htmlString, targetClass) => {
    // 1. Parse the string into a temporary DOM document
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    // 2. Select all spans with that specific class
    const elementsToRemove = doc.querySelectorAll(`span.${targetClass}`);

    // 3. Delete the elements and their children entirely
    elementsToRemove.forEach(el => el.remove());

    // 4. Return the resulting HTML string
    return doc.body.innerHTML;
  }

  const finalizeGenerationState = () => {
    throttledStreamUpdate.cancel();
    streamModeRef.current = null;
    setGeneratedResponse('');
    setPreviousContent('');
    previousContentRef.current = '';
    reviseContentRef.current = '';
    setReviseContent('');
    setPreviousSelectionRange({ from: 0, to: 0 });
    setSelectedText('');
    setSelectionRange({ from: 0, to: 0 });
  };

  const buildAcceptedContent = () => {
    const storedSelectionRange = previousSelectionRange;
    const isReviseModeAccept =
      storedSelectionRange.from !== 0 || storedSelectionRange.to !== 0;

    if (isReviseModeAccept && storedSelectionRange.from !== storedSelectionRange.to) {
      const htmlResponse = textToHtml(generatedResponse);
      let newContent = insertHtmlByClass(editor.getHTML(), 'revise-content-start', htmlResponse);
      newContent = removeSpanAndContent(newContent, 'original-content-start');
      newContent = removeSpecificSpan(newContent, 'revise-content-start');
      return newContent;
    }

    if (generatedResponse) {
      return previousContent + textToHtml(generatedResponse);
    }

    return editor.getHTML();
  };

  const handleAccept = async () => {
    if (!editor || !activeFile) return;
    if (!generatedResponse && !previousContent) return;

    try {
      setSaving(true);
      const finalContent = buildAcceptedContent();

      editor.commands.setContent(finalContent, false);
      if (onEditorContentChange) onEditorContentChange(finalContent);

      await persistEditorContent(finalContent);
      finalizeGenerationState();
      clearStatus();

      const text = editor.getText();
      const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
      setWordCount(words.length);
      setTokenCount(Math.ceil(text.length / 4));
    } catch (error) {
      showStatus('Failed to save file: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!editor || !activeFile || !previousContent) return;

    try {
      setSaving(true);
      editor.commands.setContent(previousContent, false);
      if (onEditorContentChange) onEditorContentChange(previousContent);

      await persistEditorContent(previousContent);
      finalizeGenerationState();
      clearStatus();

      const text = editor.getText();
      const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
      setWordCount(words.length);
      setTokenCount(Math.ceil(text.length / 4));
    } catch (error) {
      showStatus('Failed to save file: ' + (error.response?.data?.error || error.message), 'error');
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

      {editor && (
        <div className="toolbar">
          <select
            className="font-family-select"
            value={editor.getAttributes('textStyle').fontFamily || 'default'}
            onChange={(e) => {
              const fontFamily = e.target.value;
              if (fontFamily === 'default') {
                editor.chain().focus().unsetFontFamily().run();
              } else {
                editor.chain().focus().setFontFamily(fontFamily).run();
              }
            }}
            title="Font Family"
            disabled={generating || generatedResponse !== ''}
            style={{
              fontFamily: editor.getAttributes('textStyle').fontFamily || 'Open Sans'
            }}
          >
            <option value="default">Default (Open Sans)</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="Comic Sans MS">Comic Sans MS</option>
            <option value="Trebuchet MS">Trebuchet MS</option>
            <option value="Impact">Impact</option>
            <option value="Lucida Console">Lucida Console</option>
            <option value="Palatino">Palatino</option>
            <option value="Garamond">Garamond</option>
            <option value="Bookman">Bookman</option>
            <option value="Open Sans">Open Sans</option>
            <option value="Roboto">Roboto</option>
            <option value="Lato">Lato</option>
            <option value="Montserrat">Montserrat</option>
            <option value="Playfair Display">Playfair Display</option>
            <option value="Merriweather">Merriweather</option>
          </select>
          <select
            className="font-size-select"
            value={editor.getAttributes('textStyle').fontSize || '18'}
            onChange={(e) => {
              const fontSize = e.target.value;
              if (fontSize === 'default') {
                editor.chain().focus().unsetFontSize().run();
              } else {
                editor.chain().focus().setFontSize(parseInt(fontSize)).run();
              }
            }}
            title="Font Size"
            disabled={generating || generatedResponse !== ''}
          >
            <option value="default">Default (18px)</option>
            <option value="10">10px</option>
            <option value="12">12px</option>
            <option value="14">14px</option>
            <option value="16">16px</option>
            <option value="18">18px</option>
            <option value="20">20px</option>
            <option value="24">24px</option>
            <option value="28">28px</option>
            <option value="32">32px</option>
            <option value="36">36px</option>
            <option value="48">48px</option>
            <option value="60">60px</option>
            <option value="72">72px</option>
          </select>
          <div className="color-picker-wrapper">
            <input
              type="color"
              className="color-picker"
              value={editor.getAttributes('textStyle').color || '#000000'}
              onChange={(e) => {
                const color = e.target.value;
                if (color === '#000000') {
                  editor.chain().focus().unsetColor().run();
                } else {
                  editor.chain().focus().setColor(color).run();
                }
              }}
              title="Text Color"
              disabled={generating || generatedResponse !== ''}
            />
            <span className="color-label">Text</span>
          </div>
          <div className="color-picker-wrapper">
            <input
              type="color"
              className="color-picker highlight-picker"
              value={editor.getAttributes('textStyle').backgroundColor || '#ffff00'}
              onChange={(e) => {
                const backgroundColor = e.target.value;
                if (backgroundColor === '#ffff00' || backgroundColor === '#ffffff') {
                  editor.chain().focus().unsetHighlight().run();
                } else {
                  editor.chain().focus().setHighlight(backgroundColor).run();
                }
              }}
              title="Highlight Color"
              disabled={generating || generatedResponse !== ''}
            />
            <span className="color-label">Highlight</span>
          </div>
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            className={editor.getAttributes('textStyle').backgroundColor ? 'is-active' : ''}
            title="Remove Highlight"
            disabled={generating || generatedResponse !== ''}
          >
            ⚪
          </button>
          <div className="toolbar-divider"></div>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'is-active' : ''}
            title="Bold"
            disabled={generating || generatedResponse !== ''}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'is-active' : ''}
            title="Italic"
            disabled={generating || generatedResponse !== ''}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive('strike') ? 'is-active' : ''}
            title="Strikethrough"
            disabled={generating || generatedResponse !== ''}
          >
            <s>S</s>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'is-active' : ''}
            title="Underline"
            disabled={generating || generatedResponse !== ''}
          >
            <u>U</u>
          </button>
          <div className="toolbar-divider"></div>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}
            title="Align Left"
            disabled={generating || generatedResponse !== ''}
          >
            ⬅
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}
            title="Align Center"
            disabled={generating || generatedResponse !== ''}
          >
            ⬌
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}
            title="Align Right"
            disabled={generating || generatedResponse !== ''}
          >
            ➡
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            className={editor.isActive({ textAlign: 'justify' }) ? 'is-active' : ''}
            title="Justify"
            disabled={generating || generatedResponse !== ''}
          >
            ⬌⬌
          </button>
          <div className="toolbar-divider"></div>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
            title="Heading 1"
            disabled={generating || generatedResponse !== ''}
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
            title="Heading 2"
            disabled={generating || generatedResponse !== ''}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
            title="Heading 3"
            disabled={generating || generatedResponse !== ''}
          >
            H3
          </button>
          <div className="toolbar-divider"></div>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? 'is-active' : ''}
            title="Bullet List"
            disabled={generating || generatedResponse !== ''}
          >
            •
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? 'is-active' : ''}
            title="Numbered List"
            disabled={generating || generatedResponse !== ''}
          >
            1.
          </button>
          <div className="toolbar-divider"></div>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={editor.isActive('blockquote') ? 'is-active' : ''}
            title="Quote"
            disabled={generating || generatedResponse !== ''}
          >
            "
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
            disabled={generating || generatedResponse !== ''}
          >
            ─
          </button>
          <div className="toolbar-divider"></div>
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo() || generating}
            title="Undo"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo() || generating}
            title="Redo"
          >
            ↷
          </button>
        </div>
      )}

      <div className="editor-container">
        <EditorContent editor={editor} />
      </div>

      {/* Prompt Preview Modal */}
      {showPromptPreview && (
        <div className="modal-overlay" onClick={() => setShowPromptPreview(false)}>
          <div className="modal-content prompt-preview-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Prompt Preview</h4>
            <div className="prompt-preview-content">
              <div className="prompt-text" dangerouslySetInnerHTML={{ __html: previewPrompt.replace(/\n/g, '<br/>') }}></div>
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

      {/* Continue Prompt Modal */}
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

      {/* Revise Prompt Modal */}
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

      {/* Continue System Prompt Modal */}
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

      {/* Revise System Prompt Modal */}
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

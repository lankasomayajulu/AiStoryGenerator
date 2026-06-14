const axios = require('axios');
const { OPENROUTER_MODELS, OPENROUTER_CHAT } = require('../constants/urls');
const aiRequestLogService = require('./aiRequestLogService');
const {
  extractUsageMetaFromCompletionJson,
  parseCostUsdFromHeaders,
  accumulateChatCompletionStream,
} = require('../utils/openRouterUsage');

const REQUEST_TYPES = ['GSD', 'OCR', 'Image', 'Plain Text'];

// Gemini (via OpenRouter) reads these from `extra_body`; BLOCK_NONE turns off blocking for each category.
const GEMINI_SAFETY_SETTINGS_OFF = [
  { category: 'HARM_CATEGORY_UNSPECIFIED', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

const modelId = (m) => String(m || '').toLowerCase();

const isOpenRouterGeminiModel = (model) => {
  const id = modelId(model);
  return id.startsWith('google/') || (id.includes('gemini') && id.includes('google'));
};

const isOpenRouterMistralModel = (model) => modelId(model).includes('mistral');

const withOpenRouterSafetyRelaxed = (model, options = {}) => {
  const { extra_body: callerExtraBody, safe_prompt: _omit, ...rest } = options;
  const mergedExtra =
    callerExtraBody && typeof callerExtraBody === 'object' && !Array.isArray(callerExtraBody)
      ? { ...callerExtraBody }
      : {};

  const out = { ...rest };

  if (isOpenRouterMistralModel(model)) {
    out.safe_prompt = false;
  }

  if (isOpenRouterGeminiModel(model)) {
    out.extra_body = {
      ...mergedExtra,
      safety_settings: GEMINI_SAFETY_SETTINGS_OFF,
    };
  } else if (Object.keys(mergedExtra).length > 0) {
    out.extra_body = mergedExtra;
  }

  return out;
};

const openRouterHeaders = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'HTTP-Referer': 'http://localhost:6900',
  'X-Title': 'Story Generator',
  'Content-Type': 'application/json',
});

const stripInternalLogHints = (options) => {
  if (!options || typeof options !== 'object') return {};
  const { _aiLogOperation: _a, _requestType: _b, ...rest } = options;
  return rest;
};

const buildChatCompletionBody = (model, messages, stream, options = {}) => ({
  model,
  messages,
  stream,
  ...withOpenRouterSafetyRelaxed(model, stripInternalLogHints(options)),
});

const resolveLogOperation = (options, defaultOperation) => {
  const tag = options && typeof options === 'object' ? options._aiLogOperation : null;
  return typeof tag === 'string' && tag.trim() ? tag.trim() : defaultOperation;
};

const resolveRequestType = (options, defaultType = 'Plain Text') => {
  const r = options && typeof options === 'object' ? options._requestType : null;
  return typeof r === 'string' && REQUEST_TYPES.includes(r) ? r : defaultType;
};

const enqueueAiLogEntry = (entry) => {
  aiRequestLogService.enqueueAiLog(entry);
};

const postChatCompletionJson = async (apiKey, body, operation, requestType = 'Plain Text') => {
  try {
    const response = await axios.post(OPENROUTER_CHAT, body, {
      headers: openRouterHeaders(apiKey),
    });
    const meta = extractUsageMetaFromCompletionJson(response.data);
    if (meta.costUsd == null && response.headers) {
      const fromHdr = parseCostUsdFromHeaders(response.headers);
      if (fromHdr != null) meta.costUsd = fromHdr;
    }
    enqueueAiLogEntry({
      operation,
      requestType,
      model: body.model,
      requestBody: body,
      responseBody: response.data,
      ...meta,
    });
    return response.data;
  } catch (error) {
    const responseData = error.response?.data;
    const meta =
      responseData && typeof responseData === 'object'
        ? extractUsageMetaFromCompletionJson(responseData)
        : {
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
            costUsd: null,
            finishReason: null,
          };
    enqueueAiLogEntry({
      operation,
      requestType,
      model: body?.model,
      requestBody: body,
      responseBody:
        responseData && typeof responseData === 'object' ? responseData : { error: String(error.message || error) },
      ...meta,
      errorMessage: error.message || String(error),
      finishReason: meta.finishReason || 'error',
    });
    throw error;
  }
};

const sortModelsAlphabetically = (models) => {
  if (!Array.isArray(models)) return [];
  return models.slice().sort((a, b) => {
    const aKey = a?.id || a?.name || '';
    const bKey = b?.id || b?.name || '';
    return aKey.localeCompare(bKey, undefined, { sensitivity: 'base' });
  });
};

const getAllModels = async (outputModalities) => {
  try {
    const params = {};
    if (outputModalities) {
      params.output_modalities = Array.isArray(outputModalities)
        ? outputModalities.join(',')
        : outputModalities;
    }

    const response = await axios.get(
      OPENROUTER_MODELS,
      Object.keys(params).length > 0 ? { params } : undefined
    );

    const models = response.data.data || [];
    return sortModelsAlphabetically(models);
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    throw error;
  }
};

const getStreamingResponse = async (apiKey, model, messages, options = {}) => {
  const body = buildChatCompletionBody(model, messages, true, options);
  try {
    const response = await axios.post(OPENROUTER_CHAT, body, {
      headers: openRouterHeaders(apiKey),
      responseType: 'stream',
    });
    return { stream: response.data, requestBody: body };
  } catch (error) {
    const meta =
      error.response?.data && typeof error.response.data === 'object'
        ? extractUsageMetaFromCompletionJson(error.response.data)
        : {
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
            costUsd: null,
            finishReason: null,
          };
    const errData = error.response?.data;
    enqueueAiLogEntry({
      operation: resolveLogOperation(options, 'stream'),
      requestType: resolveRequestType(options, 'Plain Text'),
      model: body.model,
      requestBody: body,
      responseBody:
        errData && typeof errData === 'object' ? errData : { error: String(error.message || error) },
      ...meta,
      errorMessage: error.message || String(error),
      finishReason: meta.finishReason || 'error',
    });
    throw error;
  }
};

/**
 * Non-streaming JSON completion (Plain Text / OCR paths, etc.).
 */
const getResponse = async (apiKey, model, messages, options = {}) => {
  const requestType = resolveRequestType(options, 'Plain Text');
  const logOperation = resolveLogOperation(options, 'chat');
  const body = buildChatCompletionBody(model, messages, false, options);
  return postChatCompletionJson(apiKey, body, logOperation, requestType);
};

/**
 * Streams the completion server-side, aggregates assistant text + usage, logs once, returns OpenAI-shaped JSON.
 * Used for GSD so token accounting matches streaming OpenRouter.
 */
const streamResponseToJson = async (apiKey, model, messages, options = {}) => {
  const requestType = resolveRequestType(options, 'GSD');
  const logOperation = resolveLogOperation(options, 'chat');
  const body = buildChatCompletionBody(model, messages, true, options);

  try {
    const response = await axios.post(OPENROUTER_CHAT, body, {
      headers: openRouterHeaders(apiKey),
      responseType: 'stream',
    });

    const { fullText, meta } = await accumulateChatCompletionStream(response.data);
    let costUsd = meta.costUsd;
    if (costUsd == null && response.headers) {
      const fromHdr = parseCostUsdFromHeaders(response.headers);
      if (fromHdr != null) costUsd = fromHdr;
    }

    const responseBody = {
      choices: [
        {
          message: { role: 'assistant', content: fullText },
          finish_reason: meta.finishReason || 'stop',
        },
      ],
      usage: {
        prompt_tokens: meta.inputTokens,
        completion_tokens: meta.outputTokens,
        total_tokens: meta.totalTokens,
      },
      _aggregatedFromSse: true,
    };

    enqueueAiLogEntry({
      operation: logOperation,
      requestType,
      model: body.model,
      requestBody: body,
      responseBody,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      totalTokens: meta.totalTokens,
      costUsd,
      finishReason: meta.finishReason,
    });

    return {
      choices: [
        {
          message: { content: fullText },
          finish_reason: meta.finishReason || 'stop',
        },
      ],
      usage: {
        prompt_tokens: meta.inputTokens,
        completion_tokens: meta.outputTokens,
        total_tokens: meta.totalTokens,
      },
    };
  } catch (error) {
    const respData = error.response?.data;
    const meta =
      respData && typeof respData === 'object'
        ? extractUsageMetaFromCompletionJson(respData)
        : {
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
            costUsd: null,
            finishReason: null,
          };
    enqueueAiLogEntry({
      operation: logOperation,
      requestType,
      model: body?.model,
      requestBody: body,
      responseBody:
        respData && typeof respData === 'object' ? respData : { error: String(error.message || error) },
      ...meta,
      errorMessage: error.message || String(error),
      finishReason: meta.finishReason || 'error',
    });
    throw error;
  }
};

const generateImage = async (apiKey, model, prompt, options = {}) => {
  const {
    modalities = ['image'],
    image_config,
    ...rest
  } = options;

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    modalities,
    image_config,
    stream: false,
    ...withOpenRouterSafetyRelaxed(model, stripInternalLogHints(rest)),
  };

  return postChatCompletionJson(apiKey, body, 'image', 'Image');
};

module.exports = {
  getAllModels,
  getStreamingResponse,
  getResponse,
  generateImage,
  streamResponseToJson,
  REQUEST_TYPES,
};

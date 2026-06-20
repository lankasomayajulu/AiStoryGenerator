const openRouterService = require('../services/openRouterService');
const mongodbService = require('../services/mongodbService');
const aiRequestLogService = require('../services/aiRequestLogService');
const { createStreamingUsageAccumulator } = require('../utils/openRouterUsage');
const { buildReasoningOption } = require('../utils/reasoning');

const getAllModels = async (req, res) => {
  try {
    // Optional: allow filtering models by output modalities (e.g. `?output_modalities=image`)
    const outputModalities = req.query.output_modalities;
    const models = await openRouterService.getAllModels(outputModalities);
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getStreamingResponse = async (req, res) => {
  try {
    const { messages, model, max_tokens, temperature, prompt, systemPrompt, useGsd } = req.body;
    const settings = await mongodbService.getSettings();

    if (!settings.ApiKey) {
      return res.status(400).json({ error: 'API key not configured' });
    }

    const useGsdStreaming =
      useGsd === true ||
      useGsd === 'true' ||
      (useGsd === undefined &&
        !!settings.UseGsdForStreaming);

    // Use provided values or fall back to settings
    const finalModel = model || settings.DefaultModel;
    const finalMaxTokens = max_tokens || settings.OutputLength;
    const finalTemperature = temperature !== undefined ? temperature : settings.Temperature;

    const normalizedMessages = Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt }];

    const finalMessages = systemPrompt && String(systemPrompt).trim()
      ? [{ role: 'system', content: String(systemPrompt).trim() }, ...normalizedMessages]
      : normalizedMessages;

    const streamOptions = {
      max_tokens: finalMaxTokens,
      temperature: finalTemperature,
      // Reasoning effort comes from settings; exclude keeps reasoning tokens out of the editor stream.
      reasoning: buildReasoningOption(settings.ReasoningEffort, { exclude: true }),
      _requestType: useGsdStreaming ? 'GSD' : 'Plain Text',
      _aiLogOperation: useGsdStreaming ? 'project-stream-gsd' : 'stream',
    };

    const { stream, requestBody } = await openRouterService.getStreamingResponse(
      settings.ApiKey,
      finalModel,
      finalMessages,
      streamOptions
    );

    const sseUsage = createStreamingUsageAccumulator();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    stream.on('data', (chunk) => {
      sseUsage.push(chunk);
      res.write(chunk);
    });

    stream.on('end', () => {
      const finalized = sseUsage.finalize();
      const { assistantText, ...usageMeta } = finalized;
      const responseBody = {
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: assistantText || '' },
            finish_reason: usageMeta.finishReason || null,
          },
        ],
        _aggregatedFromClientStream: true,
      };
      aiRequestLogService.enqueueAiLog({
        operation: useGsdStreaming ? 'project-stream-gsd' : 'stream',
        requestType: useGsdStreaming ? 'GSD' : 'Plain Text',
        model: requestBody.model,
        requestBody,
        responseBody,
        ...usageMeta,
      });
      res.end();
    });

    stream.on('error', (error) => {
      const finalized = sseUsage.finalize();
      const { assistantText, ...usageMeta } = finalized;
      const responseBody = {
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: assistantText || '' },
            finish_reason: usageMeta.finishReason || 'error',
          },
        ],
        _aggregatedFromClientStream: true,
        streamError: error.message || String(error),
      };
      aiRequestLogService.enqueueAiLog({
        operation: useGsdStreaming ? 'project-stream-gsd' : 'stream',
        requestType: useGsdStreaming ? 'GSD' : 'Plain Text',
        model: requestBody.model,
        requestBody,
        responseBody,
        ...usageMeta,
        errorMessage: error.message || String(error),
        finishReason: usageMeta.finishReason || 'error',
      });
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.end();
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getResponse = async (req, res) => {
  try {
    const { messages, model, max_tokens, temperature, prompt, systemPrompt, options } = req.body;
    const settings = await mongodbService.getSettings();
    
    if (!settings.ApiKey) {
      return res.status(400).json({ error: 'API key not configured' });
    }

    // Use provided values or fall back to settings
    const finalModel = model || settings.DefaultModel;
    const finalMaxTokens =
      max_tokens !== undefined ? max_tokens : settings.OutputLength;
    const finalTemperature = temperature !== undefined ? temperature : settings.Temperature;

    const normalizedMessages = Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt }];

    const finalMessages = systemPrompt && String(systemPrompt).trim()
      ? [{ role: 'system', content: String(systemPrompt).trim() }, ...normalizedMessages]
      : normalizedMessages;

    const extraOpts =
      options && typeof options === 'object' && !Array.isArray(options) ? { ...options } : {};

    const response = await openRouterService.getResponse(
      settings.ApiKey,
      finalModel,
      finalMessages,
      {
        reasoning: buildReasoningOption(settings.ReasoningEffort, { exclude: true }),
        ...extraOpts,
        max_tokens: finalMaxTokens,
        temperature: finalTemperature,
      }
    );

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Generate an image via OpenRouter chat completions
const generateImage = async (req, res) => {
  try {
    const { prompt, model, modalities, image_config } = req.body || {};
    const settings = await mongodbService.getSettings();

    if (!settings.ApiKey) {
      return res.status(400).json({ error: 'API key not configured' });
    }

    const finalModel = model || settings.DefaultModel;

    if (!finalModel) {
      return res.status(400).json({ error: 'Model not provided and no DefaultModel is configured' });
    }

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const response = await openRouterService.generateImage(settings.ApiKey, finalModel, prompt, {
      modalities,
      image_config,
    });

    const message = response?.choices?.[0]?.message;
    const images = message?.images || [];

    const imageUrls = images
      .map((img) => {
        // OpenRouter can return either `image_url` or `imageUrl` depending on SDK/version
        const url =
          img?.image_url?.url ||
          img?.image_url?.data ||
          img?.imageUrl?.url ||
          img?.imageUrl?.data ||
          null;
        return url;
      })
      .filter(Boolean);

    if (imageUrls.length === 0) {
      return res.status(500).json({
        error: 'No images returned from OpenRouter',
      });
    }

    res.json({
      images: imageUrls,
      content: message?.content || null,
      model: finalModel,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllModels,
  getStreamingResponse,
  getResponse,
  generateImage,
};


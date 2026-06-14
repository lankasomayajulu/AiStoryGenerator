import React, { useEffect, useMemo, useState } from 'react';
import { openRouterApi } from '../services/api';
import { useStatusBar } from '../context/StatusBarContext';
import './ImageGeneratorPage.css';

const sortModelsAlphabetically = (models) => {
  const arr = Array.isArray(models) ? models : [];
  return arr.slice().sort((a, b) => {
    const aKey = a?.id || a?.name || '';
    const bKey = b?.id || b?.name || '';
    return aKey.localeCompare(bKey, undefined, { sensitivity: 'base' });
  });
};

const ImageGeneratorPage = () => {
  const [prompt, setPrompt] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');

  const [loadingModels, setLoadingModels] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [imageUrl, setImageUrl] = useState(null);
  const { showStatus, clearStatus } = useStatusBar();

  const sortedModels = useMemo(() => sortModelsAlphabetically(models), [models]);

  useEffect(() => {
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const response = await openRouterApi.getImageModels();
      const sorted = sortModelsAlphabetically(response.data);
      setModels(sorted);
      if (sorted.length > 0) {
        setSelectedModel(sorted[0].id);
      }
    } catch (error) {
      console.error('Failed to load image models:', error);
      showStatus(`Failed to load models: ${error.response?.data?.error || error.message}`, 'error');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showStatus('Please enter a prompt', 'error');
      return;
    }
    if (!selectedModel) {
      showStatus('Please select an OpenRouter model', 'error');
      return;
    }

    setGenerating(true);
    setImageUrl(null);
    clearStatus();

    try {
      const response = await openRouterApi.generateImage(prompt, selectedModel, {
        // Many image models accept additional params; request the simplest form here.
        modalities: ['image'],
      });

      const images = response.data?.images || [];
      if (images.length === 0) {
        showStatus('OpenRouter returned no images for that model/prompt', 'error');
        return;
      }

      setImageUrl(images[0]);
      showStatus('Image generated successfully', 'success');
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to generate image';
      console.error('Image generation error:', err);
      showStatus(errorMessage, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleClear = () => {
    setPrompt('');
    setImageUrl(null);
    clearStatus();
  };

  return (
    <div className="image-generator-page">
      <div className="image-generator-header">
        <h1>Image Generator</h1>
        <p className="subtitle">Generate images from text using OpenRouter models</p>
      </div>

      <div className="image-generator-container">
        <div className="image-generator-form">
          <div className="form-section">
            <label htmlFor="image-prompt">Prompt</label>
            <textarea
              id="image-prompt"
              className="prompt-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., A cute cat astronaut floating in space, vibrant colors, high detail"
              disabled={generating}
            />
          </div>

          <div className="form-section">
            <label htmlFor="image-model-select">OpenRouter Model Selection</label>
            <select
              id="image-model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={loadingModels || generating}
            >
              {sortedModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </option>
              ))}
            </select>
            {sortedModels.length === 0 && (
              <small className="hint">No image-capable models found</small>
            )}
          </div>

          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={generating || !prompt.trim() || !selectedModel}
            >
              {generating ? 'Generating...' : 'Generate Image'}
            </button>
            <button
              className="btn-secondary"
              onClick={handleClear}
              disabled={generating}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="image-result">
          <div className="result-card">
            <div className="result-header">
              <h2>Generated Image</h2>
              {imageUrl && (
                <small className="hint">Tip: right-click to save image</small>
              )}
            </div>

            {generating && (
              <div className="loading-placeholder">Generating image...</div>
            )}

            {!generating && !imageUrl && (
              <div className="empty-result">
                <p>No image generated yet.</p>
                <p>Enter a prompt and choose a model.</p>
              </div>
            )}

            {imageUrl && (
              <img
                className="generated-image"
                src={imageUrl}
                alt="Generated result"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageGeneratorPage;


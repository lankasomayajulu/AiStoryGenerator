import React, { useState, useEffect } from 'react';
import { settingsApi } from '../services/api';
import { useStatusBar } from '../context/StatusBarContext';
import './SettingsTab.css';

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

const SettingsTab = ({
  settings,
  models,
  onSettingsUpdate,
  onCurrentSettingsChange,
}) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [modelViewMode, setModelViewMode] = useState('favourites'); // 'favourites' or 'all'
  const { showStatus, clearStatus } = useStatusBar();

  // Update local settings when props change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (field, value) => {
    const updatedSettings = { ...localSettings, [field]: value };
    setLocalSettings(updatedSettings);
    // Notify parent of current settings change (for immediate use)
    if (onCurrentSettingsChange) {
      onCurrentSettingsChange(updatedSettings);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      clearStatus();
      const response = await settingsApi.update(localSettings);
      onSettingsUpdate(response.data);
      showStatus('Settings saved successfully', 'success');
    } catch (error) {
      showStatus('Failed to save settings: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Get available models based on view mode
  const getAvailableModels = () => {
    if (modelViewMode === 'favourites') {
      return models.filter(model => localSettings.FavouriteModels.includes(model.id));
    }
    return models;
  };

  // Get default model options
  const getDefaultModelOptions = () => {
    const availableModels = getAvailableModels();
    const defaultModelId = localSettings.DefaultModel;
    const defaultModel = models.find(m => m.id === defaultModelId);
    
    // If default model is not in available models, add it
    if (defaultModel && !availableModels.find(m => m.id === defaultModelId)) {
      return [...availableModels, defaultModel];
    }
    return availableModels;
  };


  return (
    <div className="settings-tab">
      <h3>Settings</h3>

      <div className="settings-group">
        <label>API Key</label>
        <input
          type="password"
          value={localSettings.ApiKey}
          onChange={(e) => handleChange('ApiKey', e.target.value)}
          placeholder="Enter OpenRouter API Key"
        />
      </div>

      <div className="settings-group">
        <label>Model View</label>
        <div className="radio-group">
          <label className="radio-label">
            <input
              type="radio"
              name="modelView"
              value="favourites"
              checked={modelViewMode === 'favourites'}
              onChange={(e) => setModelViewMode(e.target.value)}
            />
            <span>Favourites</span>
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="modelView"
              value="all"
              checked={modelViewMode === 'all'}
              onChange={(e) => setModelViewMode(e.target.value)}
            />
            <span>All Models</span>
          </label>
        </div>
      </div>

      <div className="settings-group">
        <label>Favourite Models</label>
        <div className="favourite-models">
          {models.map((model) => (
            <label key={model.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={localSettings.FavouriteModels.includes(model.id)}
                onChange={(e) => {
                  const favourites = e.target.checked
                    ? [...localSettings.FavouriteModels, model.id]
                    : localSettings.FavouriteModels.filter(id => id !== model.id);
                  handleChange('FavouriteModels', favourites);
                }}
              />
              <span>{model.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <label>Default Model</label>
        <select
          value={localSettings.DefaultModel}
          onChange={(e) => handleChange('DefaultModel', e.target.value)}
        >
          <option value="">Select a model</option>
          {getDefaultModelOptions().map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-group">
        <label>Temperature</label>
        <div className="slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localSettings.Temperature}
            onChange={(e) => handleChange('Temperature', parseFloat(e.target.value))}
            className="temperature-slider"
          />
          <span className="slider-value">{localSettings.Temperature.toFixed(2)}</span>
        </div>
        <small>Range: 0.0 - 1.0</small>
      </div>

      <div className="settings-group">
        <label>Maximum Output Length</label>
        <select
          value={localSettings.OutputLength}
          onChange={(e) => handleChange('OutputLength', parseInt(e.target.value))}
        >
          {OUTPUT_LENGTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.value})
            </option>
          ))}
        </select>
      </div>

      <div className="settings-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!localSettings.UseGsdForStreaming}
            onChange={(e) => handleChange('UseGsdForStreaming', e.target.checked)}
          />
          <span>Use GSD</span>
        </label>
        <small className="settings-hint">
          When enabled, Continue / Revise streaming uses the same OpenRouter options as GSD (no reasoning trim). When
          off, streaming uses the standard project path. Selected files are still sent the same way in both modes.
        </small>
      </div>

      <button
        className="save-settings-btn"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
};

export default SettingsTab;

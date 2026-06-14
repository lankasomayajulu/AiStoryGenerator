import React, { useState, useEffect } from 'react';

const PlanningModelPickerModalV2 = ({
  open,
  onClose,
  models,
  favouriteModelIds,
  modelDiscuss,
  modelPlan,
  modelScene,
  modelElaborate,
  onApply
}) => {
  const [modelViewMode, setModelViewMode] = useState('favourites');
  const [localDiscuss, setLocalDiscuss] = useState(modelDiscuss);
  const [localPlan, setLocalPlan] = useState(modelPlan);
  const [localScene, setLocalScene] = useState(modelScene);
  const [localElaborate, setLocalElaborate] = useState(modelElaborate);

  useEffect(() => {
    if (open) {
      setLocalDiscuss(modelDiscuss || '');
      setLocalPlan(modelPlan || '');
      setLocalScene(modelScene || '');
      setLocalElaborate(modelElaborate || '');
    }
  }, [open, modelDiscuss, modelPlan, modelScene, modelElaborate]);

  if (!open) return null;

  const favourites = Array.isArray(favouriteModelIds) ? favouriteModelIds : [];

  const getAvailableModels = () => {
    if (modelViewMode === 'favourites') {
      return models.filter((model) => favourites.includes(model.id));
    }
    return models;
  };

  const augmentWithSelected = (available, selectedId) => {
    if (!selectedId) return available;
    const sel = models.find((m) => m.id === selectedId);
    if (sel && !available.find((m) => m.id === sel.id)) {
      return [...available, sel];
    }
    return available;
  };

  const discussOptions = augmentWithSelected(getAvailableModels(), localDiscuss);
  const planOptions = augmentWithSelected(getAvailableModels(), localPlan);
  const sceneOptions = augmentWithSelected(getAvailableModels(), localScene);
  const elaborateOptions = augmentWithSelected(getAvailableModels(), localElaborate);

  const renderSelect = (label, value, onChange, options) => (
    <div className="settings-group-inline">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Use default model (Settings)</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name || m.id}
          </option>
        ))}
      </select>
    </div>
  );

  const handleApply = () => {
    onApply({
      modelDiscuss: localDiscuss || '',
      modelPlan: localPlan || '',
      modelScene: localScene || '',
      modelElaborate: localElaborate || ''
    });
    onClose();
  };

  return (
    <div className="modal-backdrop-planning-v2" onClick={onClose}>
      <div className="modal-panel-planning-v2" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-planning-v2">
          <h3>GSD model selection</h3>
          <button type="button" className="modal-close-planning-v2" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted modal-sub">
          Match the Settings workflow: favourites filter or browse all models. Empty choice uses your global Default
          Model from Settings.
        </p>

        <div className="settings-group-inline">
          <label>Model view</label>
          <div className="radio-row">
            <label className="radio-label">
              <input
                type="radio"
                name="pv2modelview"
                checked={modelViewMode === 'favourites'}
                onChange={() => setModelViewMode('favourites')}
              />
              <span>Favourites</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="pv2modelview"
                checked={modelViewMode === 'all'}
                onChange={() => setModelViewMode('all')}
              />
              <span>All models</span>
            </label>
          </div>
        </div>

        {renderSelect('Discuss model', localDiscuss, setLocalDiscuss, discussOptions)}
        {renderSelect('Plan parts model', localPlan, setLocalPlan, planOptions)}
        {renderSelect('Scenes model', localScene, setLocalScene, sceneOptions)}
        {renderSelect('Elaborate chapter model', localElaborate, setLocalElaborate, elaborateOptions)}

        <div className="modal-footer-planning-v2">
          <button type="button" className="btn-secondary-lite" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary-lite" onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanningModelPickerModalV2;

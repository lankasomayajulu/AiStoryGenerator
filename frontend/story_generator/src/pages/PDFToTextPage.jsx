import React, { useState, useEffect } from 'react';
import { pdfOcrApi } from '../services/api';
import { useStatusBar } from '../context/StatusBarContext';
import './PDFToTextPage.css';

const PDFToTextPage = () => {
  const [pdfFile, setPdfFile] = useState(null);
  const [selectedLanguages, setSelectedLanguages] = useState(['en']);
  const [pageNumbers, setPageNumbers] = useState('');
  const [selectedModel, setSelectedModel] = useState('openai/gpt-4o');
  const [availableModels, setAvailableModels] = useState([]);
  const [extractedText, setExtractedText] = useState('');
  const [loading, setLoading] = useState(false);
  const { showStatus, clearStatus } = useStatusBar();

  useEffect(() => {
    loadRecommendedModels();
  }, []);

  const loadRecommendedModels = async () => {
    try {
      const response = await pdfOcrApi.getRecommendedModels();
      setAvailableModels(response.data);
      if (response.data.length > 0) {
        setSelectedModel(response.data[0].id);
      }
    } catch (error) {
      console.error('Failed to load OCR models:', error);
      showStatus('Failed to load OCR models', 'error');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        showStatus('Please select a PDF file', 'error');
        return;
      }
      setPdfFile(file);
      clearStatus();
      setExtractedText('');
    }
  };

  const handleExtract = async () => {
    if (!pdfFile) {
      showStatus('Please select a PDF file', 'error');
      return;
    }

    if (!pageNumbers.trim()) {
      showStatus('Please enter page numbers', 'error');
      return;
    }

    setLoading(true);
    clearStatus();
    setExtractedText('');

    try {
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('languages', JSON.stringify(selectedLanguages));
      formData.append('pageNumbers', pageNumbers);
      formData.append('model', selectedModel);

      const response = await pdfOcrApi.extractText(formData);
      
      if (response.data.success) {
        setExtractedText(response.data.text);
        showStatus(`Successfully extracted text from pages: ${response.data.pagesProcessed.join(', ')}`, 'success');
      } else {
        throw new Error(response.data.error || 'Failed to extract text');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to extract text from PDF';
      showStatus(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = () => {
    if (extractedText) {
      navigator.clipboard.writeText(extractedText);
      showStatus('Text copied to clipboard', 'success');
    }
  };

  const handleDownloadText = () => {
    if (extractedText) {
      const blob = new Blob([extractedText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pdfFile?.name?.replace('.pdf', '') || 'extracted'}_text.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showStatus('Text downloaded', 'success');
    }
  };

  const handleClear = () => {
    setPdfFile(null);
    setSelectedLanguages(['en']);
    setPageNumbers('');
    setExtractedText('');
    clearStatus();
    // Reset file input
    const fileInput = document.getElementById('pdf-file-input');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleLanguageChange = (e) => {
    const options = Array.from(e.target.selectedOptions);
    const values = options.map(option => option.value);
    setSelectedLanguages(values);
  };

  return (
    <div className="pdf-to-text-page">
      <div className="pdf-to-text-header">
        <h1>PDF to Text Converter</h1>
        <p className="subtitle">Extract text from PDF files using OCR and OpenRouter models</p>
      </div>

      <div className="pdf-to-text-container">
        <div className="pdf-to-text-form">
          <div className="form-section">
            <label htmlFor="pdf-file-input">PDF File</label>
            <input
              id="pdf-file-input"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={loading}
            />
            {pdfFile && (
              <div className="file-info">
                <span>📄 {pdfFile.name}</span>
                <span className="file-size">({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
            )}
          </div>

          <div className="form-section">
            <label htmlFor="language-select">Input Languages (Select Multiple)</label>
            <select
              id="language-select"
              multiple
              value={selectedLanguages}
              onChange={handleLanguageChange}
              disabled={loading}
              size="6"
              className="language-multiselect"
            >
              <option value="en">English</option>
              <option value="hi">Hindi (हिंदी)</option>
              <option value="te">Telugu (తెలుగు)</option>
              <option value="kn">Kannada (ಕನ್ನಡ)</option>
              <option value="ta">Tamil (தமிழ்)</option>
              <option value="ml">Malayalam (മലയാളം)</option>
              <option value="mr">Marathi (मराठी)</option>
              <option value="gu">Gujarati (ગુજરાતી)</option>
              <option value="bn">Bengali (বাংলা)</option>
              <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
              <option value="or">Odia (ଓଡ଼ିଆ)</option>
              <option value="ur">Urdu (اردو)</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="ar">Arabic</option>
            </select>
            <small className="hint">
              Hold Ctrl (Windows) or Cmd (Mac) to select multiple languages. Selected: {selectedLanguages.length > 0 ? selectedLanguages.map(lang => {
                const langNames = {
                  'en': 'English', 'hi': 'Hindi', 'te': 'Telugu', 'kn': 'Kannada',
                  'ta': 'Tamil', 'ml': 'Malayalam', 'mr': 'Marathi', 'gu': 'Gujarati',
                  'bn': 'Bengali', 'pa': 'Punjabi', 'or': 'Odia', 'ur': 'Urdu',
                  'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian',
                  'pt': 'Portuguese', 'ru': 'Russian', 'zh': 'Chinese', 'ja': 'Japanese',
                  'ko': 'Korean', 'ar': 'Arabic'
                };
                return langNames[lang] || lang;
              }).join(', ') : 'None'}
            </small>
          </div>

          <div className="form-section">
            <label htmlFor="page-numbers-input">Page Numbers</label>
            <input
              id="page-numbers-input"
              type="text"
              placeholder="e.g., 1,2,3 or 1-5"
              value={pageNumbers}
              onChange={(e) => setPageNumbers(e.target.value)}
              disabled={loading}
            />
            <small className="hint">Enter page numbers separated by commas (e.g., 1,2,3) or ranges (e.g., 1-5)</small>
          </div>

          <div className="form-section">
            <label htmlFor="model-select">OCR Model</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={loading}
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider}){model.supportsIndianLanguages ? ' ✓ Indian Languages' : ''}
                </option>
              ))}
            </select>
            {availableModels.find(m => m.id === selectedModel) && (
              <small className="hint">
                {availableModels.find(m => m.id === selectedModel).description}
                {availableModels.find(m => m.id === selectedModel).supportsIndianLanguages && (
                  <span className="indian-lang-badge"> ✓ Supports Indian Languages</span>
                )}
              </small>
            )}
          </div>

          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={handleExtract}
              disabled={loading || !pdfFile || !pageNumbers.trim() || selectedLanguages.length === 0}
            >
              {loading ? 'Extracting...' : 'Extract Text'}
            </button>
            <button
              className="btn-secondary"
              onClick={handleClear}
              disabled={loading}
            >
              Clear
            </button>
          </div>

        </div>

        <div className="extracted-text-section">
          <div className="text-section-header">
            <h2>Extracted Text</h2>
            {extractedText && (
              <div className="text-actions">
                <button className="btn-icon" onClick={handleCopyText} title="Copy to clipboard">
                  📋
                </button>
                <button className="btn-icon" onClick={handleDownloadText} title="Download as text file">
                  💾
                </button>
              </div>
            )}
          </div>
          <textarea
            className="extracted-text-area"
            value={extractedText}
            readOnly
            placeholder="Extracted text will appear here..."
          />
          {extractedText && (
            <div className="text-stats">
              Characters: {extractedText.length} | Words: {extractedText.trim().split(/\s+/).filter(w => w.length > 0).length}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFToTextPage;


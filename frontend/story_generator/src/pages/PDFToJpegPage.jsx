import React, { useState } from 'react';
import { pdfToJpegApi } from '../services/api';
import { useStatusBar } from '../context/StatusBarContext';
import './PDFToJpegPage.css';

const PDFToJpegPage = () => {
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalPages, setTotalPages] = useState(null);
  const { showStatus, clearStatus } = useStatusBar();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        showStatus('Please select a PDF file', 'error');
        return;
      }
      setPdfFile(file);
      clearStatus();
      setProgress(0);
      setTotalPages(null);
      
      // Try to get page count (approximate based on file size)
      // Note: This is just an estimate, actual count will be determined during conversion
      const estimatedPages = Math.ceil(file.size / 50000); // Rough estimate
      setTotalPages(estimatedPages);
    }
  };

  const handleConvert = async () => {
    if (!pdfFile) {
      showStatus('Please select a PDF file', 'error');
      return;
    }

    setLoading(true);
    clearStatus();
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('pdf', pdfFile);

      showStatus('Converting PDF pages to JPEG images… This may take a while for large PDFs.', 'info', {
        persist: true,
      });

      const response = await pdfToJpegApi.convertPdfToJpeg(formData);
      
      // Create blob from response
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pdfFile.name.replace('.pdf', '')}_images.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setProgress(100);
      showStatus('PDF converted successfully! ZIP file download started.', 'success');
      
      // Reset after a delay
      setTimeout(() => {
        setProgress(0);
      }, 2000);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to convert PDF to JPEG images';
      showStatus(errorMessage, 'error');
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPdfFile(null);
    setProgress(0);
    clearStatus();
    setTotalPages(null);
    // Reset file input
    const fileInput = document.getElementById('pdf-file-input');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  return (
    <div className="pdf-to-jpeg-page">
      <div className="pdf-to-jpeg-header">
        <h1>PDF to JPEG Converter</h1>
        <p className="subtitle">Convert PDF pages to JPEG images and download as ZIP file</p>
      </div>

      <div className="pdf-to-jpeg-container">
        <div className="pdf-to-jpeg-form">
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
            {totalPages && (
              <small className="hint">
                Estimated pages: ~{totalPages} (actual count will be determined during conversion)
              </small>
            )}
          </div>

          <div className="form-section">
            <div className="info-box">
              <h3>How it works:</h3>
              <ul>
                <li>Upload a PDF file</li>
                <li>Each page will be converted to a JPEG image</li>
                <li>All images will be packaged into a ZIP file</li>
                <li>The ZIP file will be downloaded automatically</li>
                <li>Images are named: page_001.jpg, page_002.jpg, etc.</li>
              </ul>
            </div>
          </div>

          {loading && (
            <div className="form-section">
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <span className="progress-text">
                  {progress > 0 ? `Processing... ${progress}%` : 'Processing...'}
                </span>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={handleConvert}
              disabled={loading || !pdfFile}
            >
              {loading ? 'Converting...' : 'Convert to JPEG & Download ZIP'}
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

        <div className="info-section">
          <div className="info-card">
            <h2>📋 Instructions</h2>
            <ol>
              <li>Click "Choose File" and select your PDF</li>
              <li>Click "Convert to JPEG & Download ZIP"</li>
              <li>Wait for the conversion to complete</li>
              <li>The ZIP file will automatically download</li>
              <li>Extract the ZIP to get all JPEG images</li>
            </ol>
          </div>

          <div className="info-card">
            <h2>ℹ️ Information</h2>
            <ul>
              <li><strong>Image Quality:</strong> High quality JPEG (95% quality)</li>
              <li><strong>Image Resolution:</strong> 2x scale for crisp images</li>
              <li><strong>File Naming:</strong> page_001.jpg, page_002.jpg, etc.</li>
              <li><strong>Max File Size:</strong> 100MB</li>
              <li><strong>Processing Time:</strong> Depends on PDF size and page count</li>
            </ul>
          </div>

          <div className="info-card">
            <h2>⚠️ Notes</h2>
            <ul>
              <li>Large PDFs may take several minutes to process</li>
              <li>Please keep the browser tab open during conversion</li>
              <li>The ZIP file will be saved to your default download folder</li>
              <li>Each page becomes one JPEG image</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PDFToJpegPage;


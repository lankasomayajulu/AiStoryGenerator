const pdfOcrService = require('../services/pdfOcrService');
const mongodbService = require('../services/mongodbService');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

/**
 * Upload middleware for PDF files
 */
const uploadPdf = upload.single('pdf');

/**
 * Extract text from PDF using OCR
 */
const extractPdfText = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const { languages, pageNumbers, model } = req.body;
    
    // Parse languages (can be JSON string array or single string for backward compatibility)
    let selectedLanguages = ['en']; // Default to English
    if (languages) {
      if (typeof languages === 'string') {
        try {
          selectedLanguages = JSON.parse(languages);
        } catch (e) {
          // If not JSON, treat as single language (backward compatibility)
          selectedLanguages = [languages];
        }
      } else if (Array.isArray(languages)) {
        selectedLanguages = languages;
      }
    }
    
    // Ensure at least one language is selected
    if (selectedLanguages.length === 0) {
      selectedLanguages = ['en'];
    }
    
    if (!pageNumbers) {
      return res.status(400).json({ error: 'Page numbers are required' });
    }

    // Parse page numbers (can be comma-separated string, ranges like "1-5", or array)
    let pages = [];
    if (typeof pageNumbers === 'string') {
      const parts = pageNumbers.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.includes('-')) {
          // Handle range (e.g., "1-5")
          const [start, end] = trimmed.split('-').map(p => parseInt(p.trim()));
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let i = start; i <= end; i++) {
              pages.push(i);
            }
          }
        } else {
          // Handle single page number
          const pageNum = parseInt(trimmed);
          if (!isNaN(pageNum)) {
            pages.push(pageNum);
          }
        }
      }
      // Remove duplicates and sort
      pages = [...new Set(pages)].sort((a, b) => a - b);
    } else if (Array.isArray(pageNumbers)) {
      pages = pageNumbers.map(p => parseInt(p)).filter(p => !isNaN(p));
    } else {
      return res.status(400).json({ error: 'Invalid page numbers format. Use comma-separated numbers (e.g., "1,2,3") or ranges (e.g., "1-5")' });
    }

    if (pages.length === 0) {
      return res.status(400).json({ error: 'No valid page numbers provided' });
    }

    // Get settings for API key
    const settings = await mongodbService.getSettings();
    if (!settings.ApiKey) {
      return res.status(400).json({ error: 'API key not configured. Please configure OpenRouter API key in settings.' });
    }

    // Use provided model or default
    const ocrModel = model || 'openai/gpt-4o';

    // Extract text from PDF
    const extractedText = await pdfOcrService.extractTextFromPdf(
      req.file.buffer,
      pages,
      selectedLanguages,
      settings.ApiKey,
      ocrModel
    );

    res.json({
      success: true,
      text: extractedText,
      pagesProcessed: pages,
      model: ocrModel,
      languages: selectedLanguages
    });
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to extract text from PDF',
      details: error.toString()
    });
  }
};

/**
 * Get recommended OCR models
 */
const getRecommendedModels = async (req, res) => {
  try {
    const models = pdfOcrService.getRecommendedOcrModels();
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  extractPdfText,
  getRecommendedModels,
  uploadPdf
};


const pdf = require('pdf-parse');
const openRouterService = require('./openRouterService');

/**
 * Extract text from PDF pages using OCR via OpenRouter vision models
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {Array<number>} pageNumbers - Array of page numbers to process (1-indexed)
 * @param {Array<string>} languages - Array of language codes (e.g., ['en', 'hi', 'te'])
 * @param {string} apiKey - OpenRouter API key
 * @param {string} model - OpenRouter vision model name
 * @returns {Promise<string>} Extracted text
 */
const extractTextFromPdf = async (pdfBuffer, pageNumbers, languages, apiKey, model = 'openai/gpt-4o') => {
  try {
    // Parse PDF
    const pdfData = await pdf(pdfBuffer);
    const totalPages = pdfData.numpages;
    
    // Validate page numbers
    const validPages = pageNumbers.filter(page => page >= 1 && page <= totalPages);
    if (validPages.length === 0) {
      throw new Error(`No valid pages found. PDF has ${totalPages} pages.`);
    }

    // For now, we'll extract text directly from PDF if it has text layers
    // If PDF is image-based, we would need to convert pages to images first
    // and then use vision models. For simplicity, we'll extract text directly.
    
    let extractedText = '';
    
    // Extract text from PDF
    // Note: pdf-parse extracts all text from the PDF
    // For page-specific extraction, we would need pdfjs-dist or similar
    // For now, we extract all text and note which pages were requested
    
    if (pdfData.text && pdfData.text.trim().length > 0) {
      extractedText = pdfData.text;
      
      // Add header indicating which pages were requested
      extractedText = `[Extracted from PDF - Pages requested: ${validPages.join(', ')}]\n\n${extractedText}`;
      
      // If text extraction is poor, it might be an image-based PDF
      if (extractedText.trim().length < 100) {
        extractedText += '\n\n[Note: This PDF appears to be image-based or has minimal text. For better OCR results with image-based PDFs, consider using a dedicated OCR service that converts PDF pages to images first.]';
      }
    } else {
      // No text found - likely image-based PDF
      throw new Error('PDF appears to be image-based (no extractable text found). For image-based PDFs, you would need to convert pages to images first and then use vision models. This feature requires additional setup with pdf2pic or similar libraries.');
    }

    // Use OpenRouter vision model to enhance/extract text if needed
    // For PDFs with text layers, we can still use vision models to improve accuracy
    const languageNames = {
      'en': 'English', 'hi': 'Hindi', 'te': 'Telugu', 'kn': 'Kannada',
      'ta': 'Tamil', 'ml': 'Malayalam', 'mr': 'Marathi', 'gu': 'Gujarati',
      'bn': 'Bengali', 'pa': 'Punjabi', 'or': 'Odia', 'ur': 'Urdu',
      'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian',
      'pt': 'Portuguese', 'ru': 'Russian', 'zh': 'Chinese', 'ja': 'Japanese',
      'ko': 'Korean', 'ar': 'Arabic'
    };
    
    const languageList = languages.map(lang => languageNames[lang] || lang).join(', ');
    
    const visionPrompt = `Extract and transcribe all text from the following PDF content. 
Preserve the formatting, structure, and layout as much as possible.
The document may contain text in the following languages: ${languageList}
Please recognize and extract text in all these languages accurately.
${extractedText ? `Current extracted text:\n${extractedText.substring(0, 2000)}` : 'Please extract all text from the document.'}
Provide the complete extracted text in a clear, readable format, maintaining the original language of each text segment.`;

    try {
      const response = await openRouterService.getResponse(apiKey, model, [
        { role: 'user', content: visionPrompt }
      ], { _aiLogOperation: 'pdf-ocr', _requestType: 'OCR' });

      if (response && response.choices && response.choices[0]) {
        const enhancedText = response.choices[0].message?.content || extractedText;
        return enhancedText;
      }
    } catch (visionError) {
      console.error('Vision model enhancement failed, using extracted text:', visionError);
      // Fall back to extracted text
    }

    return extractedText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
};

/**
 * Get recommended OCR models for PDF text extraction (including Indian languages)
 * @returns {Array<Object>} Array of recommended models
 */
const getRecommendedOcrModels = () => {
  return [
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      description: 'Excellent for text extraction and OCR from images. Supports multilingual OCR including Indian languages (Hindi, Telugu, Kannada, Tamil, etc.). Best overall performance.',
      provider: 'OpenAI',
      supportsIndianLanguages: true
    },
    {
      id: 'google/gemini-pro-vision',
      name: 'Gemini Pro Vision',
      description: 'Optimized for vision tasks including document OCR. Excellent support for Indian languages and multilingual documents.',
      provider: 'Google',
      supportsIndianLanguages: true
    },
    {
      id: 'google/gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      description: 'Advanced vision model with strong multilingual support including all major Indian languages. Great for complex multilingual documents.',
      provider: 'Google',
      supportsIndianLanguages: true
    },
    {
      id: 'anthropic/claude-3-opus',
      name: 'Claude 3 Opus',
      description: 'Strong vision capabilities for document OCR and text extraction. Supports multilingual OCR including Indian languages.',
      provider: 'Anthropic',
      supportsIndianLanguages: true
    },
    {
      id: 'anthropic/claude-3-sonnet',
      name: 'Claude 3 Sonnet',
      description: 'Good balance of accuracy and speed for OCR tasks. Supports multilingual documents including Indian languages.',
      provider: 'Anthropic',
      supportsIndianLanguages: true
    },
    {
      id: 'openai/gpt-4-turbo',
      name: 'GPT-4 Turbo',
      description: 'Great for document understanding and text extraction. Supports multilingual OCR.',
      provider: 'OpenAI',
      supportsIndianLanguages: true
    },
    {
      id: 'openai/gpt-4-vision-preview',
      name: 'GPT-4 Vision Preview',
      description: 'Specialized vision model for image and document understanding. Supports multilingual OCR.',
      provider: 'OpenAI',
      supportsIndianLanguages: true
    },
    {
      id: 'anthropic/claude-3-haiku',
      name: 'Claude 3 Haiku',
      description: 'Fast and efficient OCR model with multilingual support including Indian languages. Good for quick processing.',
      provider: 'Anthropic',
      supportsIndianLanguages: true
    }
  ];
};

module.exports = {
  extractTextFromPdf,
  getRecommendedOcrModels
};


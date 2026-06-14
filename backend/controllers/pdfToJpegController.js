const pdfToJpegService = require('../services/pdfToJpegService');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
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
 * Convert PDF to JPEG images and return as ZIP file
 */
const convertPdfToJpeg = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const pdfFileName = path.parse(req.file.originalname).name;

    // Convert PDF to JPEG ZIP
    const zipBuffer = await pdfToJpegService.convertPdfToJpegZip(
      req.file.buffer,
      pdfFileName
    );

    // Set response headers for file download
    const zipFileName = `${pdfFileName}_images.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    res.setHeader('Content-Length', zipBuffer.length);

    // Send ZIP file
    res.send(zipBuffer);
  } catch (error) {
    console.error('Error converting PDF to JPEG:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to convert PDF to JPEG images',
      details: error.toString()
    });
  }
};

module.exports = {
  convertPdfToJpeg,
  uploadPdf
};


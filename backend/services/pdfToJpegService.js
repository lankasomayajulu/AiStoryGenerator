const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const JSZip = require('jszip');

/**
 * Convert PDF pages to JPEG images and create a ZIP file
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} pdfFileName - Original PDF file name (without extension)
 * @returns {Promise<Buffer>} ZIP file buffer containing all JPEG images
 */
const convertPdfToJpegZip = async (pdfBuffer, pdfFileName) => {
  // Dynamically import pdfjs-dist as it's an ES module
  const pdfjsLib = await import('pdfjs-dist');
  
  const tempDir = path.join(__dirname, '../../temp_pdf_images');
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // Configure pdfjs-dist worker (for Node.js, we can disable worker)
    if (typeof window === 'undefined') {
      // Node.js environment - disable worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = false;
    }

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ 
      data: pdfBuffer,
      useSystemFonts: true
    });
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;

    const zip = new JSZip();
    const imagePromises = [];

    // Convert each page to JPEG
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // Scale for better quality

      // Create canvas
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');

      // Render PDF page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext).promise;

      // Convert canvas to JPEG buffer
      const jpegBuffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
      
      // Add to ZIP
      const fileName = `page_${pageNum.toString().padStart(3, '0')}.jpg`;
      zip.file(fileName, jpegBuffer);
    }

    // Generate ZIP file buffer
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    return zipBuffer;
  } catch (error) {
    console.error('Error converting PDF to JPEG:', error);
    throw error;
  } finally {
    // Clean up temp directory if it exists
    if (fs.existsSync(tempDir)) {
      try {
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
          fs.unlinkSync(path.join(tempDir, file));
        });
        fs.rmdirSync(tempDir);
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
    }
  }
};

module.exports = {
  convertPdfToJpegZip
};


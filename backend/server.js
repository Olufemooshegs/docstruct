const express = require('express');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const natural = require('natural');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// File storage configuration
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Initialize NLP tokenizer for text processing
const tokenizer = new natural.WordTokenizer();

// Create uploads directory if it doesn't exist
async function ensureUploadsDir() {
  try {
    await fsp.mkdir('./uploads/', { recursive: true });
  } catch (error) {
    console.log('Uploads directory already exists');
  }
}

ensureUploadsDir();

// API Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Process text input (for typed text)
app.post('/api/process-text', async (req, res) => {
  try {
    const { text, type = 'academic' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Process and structure the text
    const structuredContent = await processTextContent(text, type);
    
    // Generate document
    const document = await generateDocument(structuredContent, type);
    
    res.json({
      success: true,
      document: document,
      structuredContent: structuredContent
    });
    
  } catch (error) {
    console.error('Error processing text:', error);
    res.status(500).json({ error: 'Failed to process text' });
  }
});

// Process uploaded file (PDF, image, text)
app.post('/api/process-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    const filePath = req.file.path;
    const fileType = req.file.mimetype;
    const originalName = req.file.originalname;
    
    let extractedText = '';
    
    // Extract text based on file type
    if (fileType === 'application/pdf') {
      extractedText = await extractTextFromPDF(filePath);
    } else if (fileType.includes('image/')) {
      extractedText = await extractTextFromImage(filePath);
    } else if (fileType.includes('text/')) {
      extractedText = await extractTextFromTextFile(filePath);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    
    // Process the extracted text
    const type = req.body.type || 'academic';
    const structuredContent = await processTextContent(extractedText, type);
    
    // Generate document
    const document = await generateDocument(structuredContent, type);
    
    // Clean up uploaded file
    await fsp.unlink(filePath);
    
    res.json({
      success: true,
      originalFilename: originalName,
      document: document,
      structuredContent: structuredContent,
      extractedText: extractedText
    });
    
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Extract text from PDF
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text.trim();
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

// Extract text from image using OCR
async function extractTextFromImage(filePath) {
  try {
    const result = await Tesseract.recognize(filePath, 'eng', {
      logger: m => console.log(m)
    });
    return result.data.text;
  } catch (error) {
    console.error('OCR error:', error);
    throw new Error('Failed to extract text from image');
  }
}

// Extract text from text file
async function extractTextFromTextFile(filePath) {
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error('Text file read error:', error);
    throw new Error('Failed to read text file');
  }
}

// Process and structure text content using NLP
async function processTextContent(text, type = 'academic') {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const words = text.split(/\s+/).filter(w => w.trim());
  
  // Tokenize text
  const tokens = tokenizer.tokenize(text);
  
  // Detect document structure
  const structure = detectDocumentStructure(text, tokens);
  
  // Group related content
  const groupedContent = groupRelatedContent(sentences, structure);
  
  // Apply formatting based on type
  const formattedContent = await applyFormatting(groupedContent, type);
  
  return {
    originalText: text,
    wordCount: words.length,
    sentenceCount: sentences.length,
    structure: structure,
    groupedContent: groupedContent,
    formattedContent: formattedContent
  };
}

// Detect document structure using NLP
function detectDocumentStructure(text, tokens) {
  const structure = {
    sections: [],
    headings: [],
    subheadings: [],
    detectedTypes: []
  };
  
  // Common academic/business section patterns
  const sectionPatterns = {
    introduction: ['introduction', 'intro', 'background', 'overview'],
    methodology: ['methodology', 'methods', 'approach', 'procedure', 'experiment'],
    results: ['results', 'findings', 'analysis', 'data', 'observations'],
    conclusion: ['conclusion', 'summary', 'discussion', 'implications'],
    references: ['references', 'bibliography', 'works cited', 'citations']
  };
  
  const lowerText = text.toLowerCase();
  
  // Detect sections
  Object.entries(sectionPatterns).forEach(([type, patterns]) => {
    patterns.forEach(pattern => {
      if (lowerText.includes(pattern)) {
        structure.detectedTypes.push(type);
        structure.sections.push({
          type: type,
          pattern: pattern,
          position: lowerText.indexOf(pattern)
        });
      }
    });
  });
  
  // Simple heading detection (capitalized lines)
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed && trimmed.length < 100 && /^[A-Z]/.test(trimmed) && !trimmed.includes('.')) {
      if (trimmed.length > 10) {
        structure.headings.push({
          text: trimmed,
          line: index,
          type: 'main'
        });
      } else {
        structure.subheadings.push({
          text: trimmed,
          line: index,
          type: 'sub'
        });
      }
    }
  });
  
  return structure;
}

// Group related content based on structure
function groupRelatedContent(sentences, structure) {
  const groups = {
    introduction: [],
    methodology: [],
    results: [],
    conclusion: [],
    references: [],
    general: []
  };

  sentences.forEach(sentence => {
    const lowerSentence = sentence.toLowerCase();
    let assigned = false;

    // Assign to the best matching section based on keywords.
    structure.detectedTypes.forEach(sectionType => {
      if (lowerSentence.includes(sectionType) && !assigned) {
        groups[sectionType].push(sentence);
        assigned = true;
      }
    });

    if (!assigned) {
      const fallbackKey = detectFallbackSection(lowerSentence);
      if (fallbackKey) {
        groups[fallbackKey].push(sentence);
      } else {
        groups.general.push(sentence);
      }
    }
  });

  return groups;
}

function detectFallbackSection(lowerSentence) {
  if (/\b(method|approach|procedure|experiment|design)\b/.test(lowerSentence)) {
    return 'methodology';
  }

  if (/\b(result|finding|analysis|data|observation|evaluation)\b/.test(lowerSentence)) {
    return 'results';
  }

  if (/\b(conclusion|summary|discussion|implication|future work)\b/.test(lowerSentence)) {
    return 'conclusion';
  }

  if (/\b(reference|bibliography|citation|literature review)\b/.test(lowerSentence)) {
    return 'references';
  }

  if (/\b(introduction|background|overview|preliminaries)\b/.test(lowerSentence)) {
    return 'introduction';
  }

  return null;
}

// Apply formatting based on document type
async function applyFormatting(content, type) {
  const formatted = {};
  
  Object.entries(content).forEach(([section, sentences]) => {
    if (sentences.length === 0) return;
    
    const sectionText = sentences.join(' ');
    
    formatted[section] = {
      title: section.charAt(0).toUpperCase() + section.slice(1),
      content: sectionText,
      wordCount: sectionText.split(/\s+/).length,
      formatting: {
        type: type,
        font: 'Arial',
        fontSize: 11,
        lineSpacing: 1.5,
        margins: { top: 1, right: 1, bottom: 1, left: 1 }
      }
    };
  });
  
  return formatted;
}

// Generate document (DOCX format)
async function generateDocument(structuredContent, type) {
  const sections = [];

  Object.entries(structuredContent.formattedContent).forEach(([section, data]) => {
    if (data.content && data.content.trim()) {
      sections.push({
        type: section,
        title: data.title,
        content: data.content,
        formatting: data.formatting
      });
    }
  });

  const bodyXml = sections.map(section => {
    const paragraphs = [
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(section.title)}</w:t></w:r></w:p>`
    ];

    const contentParagraphs = section.content
      .split(/\n\n+/)
      .filter(Boolean)
      .map(paragraph => `<w:p><w:r><w:t>${escapeXml(paragraph)}</w:t></w:r></w:p>`);

    return paragraphs.concat(contentParagraphs).join('');
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const buffer = Buffer.from(xml, 'utf8');

  return {
    buffer: buffer.toString('base64'),
    filename: `DocStruct-${Date.now()}.docx`,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DocStruct Backend Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
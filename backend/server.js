const express = require('express');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const natural = require('natural');
const JSZip = require('jszip');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;

const users = new Map();
const pendingOtps = new Map();

function createOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createToken(email) {
  return Buffer.from(`${email}:${Date.now()}`).toString('base64');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function findUserByEmail(email) {
  return users.get(normalizeEmail(email));
}

function getSmtpConfig() {
  const host = process.env.MAIL_HOST;
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user,
      pass
    }
  };
}

async function sendOtpEmail(email, otp, name) {
  const smtpConfig = getSmtpConfig();
  const from = process.env.MAIL_FROM || 'no-reply@docstruct.ai';

  if (!smtpConfig) {
    console.log(`[OTP] To: ${email} | Code: ${otp}`);
    return {
      delivered: false,
      status: 'simulated'
    };
  }

  const transporter = nodemailer.createTransport(smtpConfig);
  const info = await transporter.sendMail({
    from,
    to: email,
    subject: 'Your DocStruct verification code',
    text: `Hello ${name || 'there'},\n\nYour verification code is ${otp}.\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hello ${name || 'there'},</p><p>Your verification code is <strong>${otp}</strong>.</p><p>If you did not request this, you can ignore this email.</p>`
  });

  return {
    delivered: true,
    status: 'sent',
    messageId: info.messageId
  };
}

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

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (findUserByEmail(normalizedEmail)) {
      return res.status(409).json({ error: 'A user with that email already exists.' });
    }

    const otp = createOtp();
    pendingOtps.set(normalizedEmail, {
      otp,
      name: String(name).trim(),
      password: String(password),
      verified: false,
      createdAt: Date.now()
    });

    const delivery = await sendOtpEmail(normalizedEmail, otp, String(name).trim());

    res.json({
      success: true,
      requiresVerification: true,
      message: delivery.delivered ? 'OTP sent to your email.' : 'OTP generated locally. Check server logs for the code.',
      otp,
      deliveryStatus: delivery.status
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const pending = pendingOtps.get(normalizedEmail);

    if (!pending) {
      return res.status(404).json({ error: 'No pending signup found for that email.' });
    }

    if (String(otp) !== String(pending.otp)) {
      return res.status(400).json({ error: 'Invalid OTP.' });
    }

    users.set(normalizedEmail, {
      name: pending.name,
      email: normalizedEmail,
      password: pending.password,
      verified: true,
      createdAt: pending.createdAt
    });

    pendingOtps.delete(normalizedEmail);

    res.json({
      success: true,
      message: 'Email verified successfully.',
      user: {
        name: pending.name,
        email: normalizedEmail
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'Failed to verify OTP.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const user = findUserByEmail(normalizedEmail);

    if (!user || user.password !== String(password)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.verified) {
      return res.status(403).json({ error: 'Please verify your email first.' });
    }

    res.json({
      success: true,
      token: createToken(normalizedEmail),
      user: {
        name: user.name,
        email: normalizedEmail
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in.' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Missing token.' });
  }

  const decoded = Buffer.from(token, 'base64').toString('utf8');
  const [email] = decoded.split(':');
  const user = findUserByEmail(email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid token.' });
  }

  res.json({
    success: true,
    user: {
      name: user.name,
      email: user.email
    }
  });
});

// Process text input (for typed text)
app.post('/api/process-text', async (req, res) => {
  try {
    const { text, type, docType, style } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const normalizedType = normalizeDocumentType(docType || type || 'academic');
    const normalizedStyle = normalizeStyle(style);

    // Process and structure the text
    const structuredContent = await processTextContent(text, normalizedType, normalizedStyle);

    // Generate document
    const document = await generateDocument(structuredContent, normalizedType, normalizedStyle);

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
    const normalizedType = normalizeDocumentType(req.body.docType || req.body.type || 'academic');
    const normalizedStyle = normalizeStyle(req.body.style);
    const structuredContent = await processTextContent(extractedText, normalizedType, normalizedStyle);

    // Generate document
    const document = await generateDocument(structuredContent, normalizedType, normalizedStyle);
    
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
async function processTextContent(text, type = 'academic', style = 'Professional') {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const words = text.split(/\s+/).filter(w => w.trim());

  // Tokenize text
  const tokens = tokenizer.tokenize(text);

  // Detect document structure
  const structure = detectDocumentStructure(text, tokens);

  // Group related content
  const groupedContent = groupRelatedContent(sentences, structure);

  // Apply formatting based on type
  const formattedContent = await applyFormatting(groupedContent, type, style);
  const preview = buildPreview(formattedContent, type, style);

  return {
    originalText: text,
    wordCount: words.length,
    sentenceCount: sentences.length,
    structure: structure,
    groupedContent: groupedContent,
    formattedContent: formattedContent,
    preview: preview
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
async function applyFormatting(content, type, style = 'Professional') {
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
        style: style,
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
async function generateDocument(structuredContent, type, style = 'Professional') {
  const sections = [];

  Object.entries(structuredContent.formattedContent || {}).forEach(([section, data]) => {
    if (data && data.content && data.content.trim()) {
      sections.push({
        type: section,
        title: data.title || section.charAt(0).toUpperCase() + section.slice(1),
        content: data.content,
        formatting: data.formatting
      });
    }
  });

  if (sections.length === 0) {
    sections.push({
      type: 'general',
      title: 'Document',
      content: structuredContent.originalText || 'No content available.',
      formatting: { type, style }
    });
  }

  const bodyXml = sections.map((section) => {
    const titleParagraph = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(section.title)}</w:t></w:r></w:p>`;
    const contentParagraphs = String(section.content)
      .split(/\n\n+/)
      .filter(Boolean)
      .map((paragraph) => `<w:p><w:r><w:t>${escapeXml(paragraph)}</w:t></w:r></w:p>`);

    return [titleParagraph, ...contentParagraphs].join('');
  }).join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="120"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
</w:styles>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);

  const buffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));

  return {
    buffer: buffer.toString('base64'),
    filename: `DocStruct-${Date.now()}.docx`,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    preview: structuredContent.preview
  };
}

function normalizeDocumentType(value) {
  const normalized = String(value || 'academic').toLowerCase();

  if (['academic report', 'assignment', 'research paper', 'academic'].includes(normalized)) {
    return 'academic';
  }

  if (['business report', 'meeting notes', 'proposal', 'business'].includes(normalized)) {
    return 'business';
  }

  return 'general';
}

function normalizeStyle(value) {
  const normalized = String(value || 'Professional').trim();
  return ['Professional', 'Academic', 'Minimal', 'Corporate'].includes(normalized) ? normalized : 'Professional';
}

function buildPreview(formattedContent, type, style) {
  const sections = Object.values(formattedContent)
    .filter((item) => item && item.content && item.content.trim())
    .map((item) => ({
      heading: item.title,
      body: item.content
    }));

  const title = sections[0]?.heading ? `${capitalize(type)} Document` : 'Untitled Document';

  return {
    title,
    style,
    docType: type,
    sections
  };
}

function capitalize(value) {
  return String(value || 'Document').charAt(0).toUpperCase() + String(value || 'Document').slice(1);
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
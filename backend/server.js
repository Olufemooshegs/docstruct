const express = require('express');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const Tesseract = require('tesseract.js');
const natural = require('natural');
const JSZip = require('jszip');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType
} = require('docx');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const PDFParser = require('pdf2json');

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_STORE_PATH = path.join(__dirname, 'data', 'auth-store.json');
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN_DAYS = Number(process.env.REFRESH_EXPIRES_IN_DAYS || 30);

// Redis optional support for refresh tokens
const REDIS_URL = process.env.REDIS_URL || null;
let redisClient = null;
if (REDIS_URL) {
  try {
    const IORedis = require('ioredis');
    redisClient = new IORedis(REDIS_URL);
  } catch (err) {
    console.warn('ioredis not installed or failed to init, falling back to DB:', err.message);
    redisClient = null;
  }
}

// In-memory fallback (only if neither Redis nor Postgres available)
const refreshTokens = new Map();

const pendingOtps = new Map();
let users = new Map();
let pool = null;

function getDatabaseConfig() {
  if (DATABASE_URL) {
    return { connectionString: DATABASE_URL };
  }

  const host = process.env.PGHOST || process.env.DB_HOST;
  const port = Number(process.env.PGPORT || process.env.DB_PORT || 5432);
  const user = process.env.PGUSER || process.env.DB_USER;
  const password = process.env.PGPASSWORD || process.env.DB_PASSWORD;
  const database = process.env.PGDATABASE || process.env.DB_NAME;

  if (!host || !user || !password || !database) {
    return null;
  }

  return {
    host,
    port,
    user,
    password,
    database
  };
}

const databaseConfig = getDatabaseConfig();

if (databaseConfig) {
  try {
    pool = new Pool(databaseConfig);
  } catch (error) {
    console.warn('Postgres pool setup skipped:', error.message);
    pool = null;
  }
}

function createOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createToken(email) {
  // Keep legacy base64 token for backward compatibility in responses
  return Buffer.from(`${email}:${Date.now()}`).toString('base64');
}

function createJwtToken(email) {
  return jwt.sign({ email: String(email).toLowerCase() }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function createRefreshToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

async function setRefreshToken(email, token) {
  const expiresAt = Date.now() + REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;
  // Redis path
  if (redisClient) {
    await redisClient.set(`refresh:${token}`, JSON.stringify({ email: String(email).toLowerCase() }), 'PX', REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);
    return;
  }

  // Postgres path
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO refresh_tokens(token, email, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (token) DO UPDATE SET email = EXCLUDED.email, expires_at = EXCLUDED.expires_at`,
        [token, String(email).toLowerCase(), expiresAt]
      );
      return;
    } catch (err) {
      console.warn('Failed to persist refresh token to Postgres:', err.message);
    }
  }

  // In-memory fallback
  refreshTokens.set(token, { email: String(email).toLowerCase(), expiresAt });
}

async function revokeRefreshToken(token) {
  if (redisClient) {
    await redisClient.del(`refresh:${token}`);
    return;
  }

  if (pool) {
    try {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
      return;
    } catch (err) {
      console.warn('Failed to revoke refresh token in Postgres:', err.message);
    }
  }

  refreshTokens.delete(token);
}

async function validateRefreshToken(token) {
  if (!token) return null;

  if (redisClient) {
    const raw = await redisClient.get(`refresh:${token}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && parsed.email ? parsed.email : null;
    } catch (err) {
      return null;
    }
  }

  if (pool) {
    try {
      const result = await pool.query('SELECT email, expires_at FROM refresh_tokens WHERE token = $1', [token]);
      if (!result.rows.length) return null;
      const row = result.rows[0];
      if (Number(row.expires_at) < Date.now()) {
        await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
        return null;
      }
      return row.email;
    } catch (err) {
      console.warn('Failed to validate refresh token in Postgres:', err.message);
      return null;
    }
  }

  const entry = refreshTokens.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    refreshTokens.delete(token);
    return null;
  }
  return entry.email;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function findUserByEmail(email) {
  return users.get(normalizeEmail(email));
}

async function loadUsersFromDatabase() {
  if (!pool) return false;

  try {
    const result = await pool.query(
      'SELECT email, name, password, verified, created_at FROM users'
    );
    const loadedUsers = new Map();

    for (const row of result.rows) {
      loadedUsers.set(normalizeEmail(row.email), {
        email: normalizeEmail(row.email),
        name: row.name,
        password: row.password,
        verified: row.verified,
        createdAt: Number(row.created_at)
      });
    }

    users = loadedUsers;
    return true;
  } catch (error) {
    console.warn('Failed to load auth users from Postgres:', error.message);
    return false;
  }
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

async function ensureAuthStoreFile() {
  try {
    await fsp.mkdir(path.dirname(AUTH_STORE_PATH), { recursive: true });
    await fsp.access(AUTH_STORE_PATH);
  } catch (error) {
    await fsp.writeFile(AUTH_STORE_PATH, JSON.stringify({ users: [] }, null, 2));
  }
}

async function loadUsersFromStore() {
  if (pool) {
    const loadedFromDatabase = await loadUsersFromDatabase();
    if (loadedFromDatabase) {
      return;
    }
  }

  await ensureAuthStoreFile();
  try {
    const raw = await fsp.readFile(AUTH_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const loadedUsers = new Map();
    for (const user of parsed.users || []) {
      loadedUsers.set(normalizeEmail(user.email), user);
    }
    users = loadedUsers;
  } catch (error) {
    console.error('Failed to load auth store:', error);
    users = new Map();
  }
}

async function persistUsersToStore() {
  if (pool) {
    return;
  }

  try {
    await ensureAuthStoreFile();
    const serialized = {
      users: Array.from(users.values())
    };
    await fsp.writeFile(AUTH_STORE_PATH, JSON.stringify(serialized, null, 2));
  } catch (error) {
    console.error('Failed to persist auth store:', error);
  }
}

async function ensureDemoUser() {
  const demoEmail = 'demo@docstruct.ai';
  const existing = findUserByEmail(demoEmail);
  if (existing) {
    return existing;
  }

  const demoUser = {
    name: 'Demo User',
    email: demoEmail,
    password: await hashPassword('DemoPass123!'),
    verified: true,
    createdAt: Date.now()
  };

  users.set(demoEmail, demoUser);
  await saveUserToDatabase(demoUser);
  await persistUsersToStore();
  return demoUser;
}

function createStoredFilename(originalName, extension) {
  const baseName = path
    .basename(String(originalName || 'document'))
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const safeBaseName = baseName || 'document';
  return `${Date.now()}-${safeBaseName}${extension}`;
}

function buildDownloadUrl(req, filename) {
  return `${req.protocol}://${req.get('host')}/api/download/${encodeURIComponent(filename)}`;
}

function unescapeXml(value) {
  return String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

async function extractDocxParagraphs(filePath) {
  const archive = await JSZip.loadAsync(await fsp.readFile(filePath));
  const documentXmlFile = archive.file('word/document.xml');

  if (!documentXmlFile) {
    return [];
  }

  const documentXml = await documentXmlFile.async('string');
  const paragraphMatches = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];

  return paragraphMatches
    .map((paragraphXml) => {
      const textParts = [];

      paragraphXml.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
        textParts.push(unescapeXml(text));
        return '';
      });

      return textParts.join('').replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

function classifyTextBlock(block, index) {
  const text = String(block || '').trim();

  if (!text) {
    return null;
  }

  if (index === 0 && text.length <= 120) {
    return { type: 'title', text };
  }

  if (/^#{1,3}\s+/.test(text)) {
    return { type: 'heading', text: text.replace(/^#{1,3}\s+/, '') };
  }

  if (/^[A-Z][A-Z0-9\s\-,:]{8,}$/.test(text) && text.length <= 90) {
    return { type: 'heading', text };
  }

  if (/^([-*•]|\d+[\.)])\s+/.test(text)) {
    return { type: 'bullet', text: text.replace(/^([-*•]|\d+[\.)])\s+/, '') };
  }

  return { type: 'paragraph', text };
}

function textToDocxParagraphs(textBlocks, fallbackTitle) {
  const children = [];
  const title = String(fallbackTitle || 'Converted Document').trim() || 'Converted Document';

  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 }
    })
  );

  textBlocks.forEach((block, index) => {
    const item = classifyTextBlock(block, index);

    if (!item) {
      return;
    }

    if (item.type === 'title' && index === 0) {
      return;
    }

    if (item.type === 'heading') {
      children.push(
        new Paragraph({
          text: item.text,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 220, after: 120 }
        })
      );
      return;
    }

    if (item.type === 'bullet') {
      children.push(
        new Paragraph({
          text: item.text,
          bullet: { level: 0 },
          spacing: { after: 80 }
        })
      );
      return;
    }

    children.push(
      new Paragraph({
        children: [new TextRun(item.text)],
        spacing: { after: 120 }
      })
    );
  });

  return children;
}

async function writeDocxFile(outputPath, title, textBlocks) {
  const document = new Document({
    sections: [
      {
        children: textToDocxParagraphs(textBlocks, title)
      }
    ]
  });

  const buffer = await Packer.toBuffer(document);
  await fsp.writeFile(outputPath, buffer);
}

async function writePdfFile(outputPath, title, textBlocks) {
  const pdf = new PDFDocument({
    size: 'A4',
    margin: 54,
    bufferPages: true
  });

  const stream = fs.createWriteStream(outputPath);
  const finished = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  pdf.pipe(stream);

  pdf.font('Helvetica-Bold').fontSize(20).text(String(title || 'Converted Document'), {
    align: 'center'
  });
  pdf.moveDown(0.75);

  textBlocks.forEach((block, index) => {
    const item = classifyTextBlock(block, index);

    if (!item) {
      pdf.moveDown(0.35);
      return;
    }

    if (item.type === 'title' && index === 0) {
      return;
    }

    if (item.type === 'heading') {
      pdf.moveDown(0.45);
      pdf.font('Helvetica-Bold').fontSize(14).text(item.text, {
        align: 'left'
      });
      pdf.moveDown(0.15);
      return;
    }

    if (item.type === 'bullet') {
      pdf.font('Helvetica').fontSize(11).text(`• ${item.text}`, {
        indent: 12,
        lineGap: 3
      });
      pdf.moveDown(0.15);
      return;
    }

    pdf.font('Helvetica').fontSize(11).text(item.text, {
      align: 'left',
      lineGap: 3
    });
    pdf.moveDown(0.25);
  });

  pdf.end();
  await finished;
}

async function convertDocxToPdf(inputPath, outputPath) {
  const paragraphs = await extractDocxParagraphs(inputPath);
  const title = paragraphs[0] || 'Converted Document';
  await writePdfFile(outputPath, title, paragraphs);
}

async function convertPdfToDocx(inputPath, outputPath) {
  const rawPdf = await fsp.readFile(inputPath);
  const parsedText = await extractTextFromPdfBuffer(rawPdf);

  const textBlocks = String(parsedText || '')
    .replace(/\r/g, '')
    .replace(/\f/g, '\n')
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const title = path.basename(outputPath, '.docx') || 'Converted Document';
  await writeDocxFile(outputPath, title, textBlocks.length ? textBlocks : ['No text could be extracted from the PDF.']);
}

async function extractTextFromPdfBuffer(pdfBuffer) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true);

    parser.on('pdfParser_dataError', (error) => {
      reject(new Error(error?.parserError || 'Failed to extract text from PDF.'));
    });

    parser.on('pdfParser_dataReady', () => {
      try {
        resolve(parser.getRawTextContent() || '');
      } catch (error) {
        reject(error);
      }
    });

    parser.parseBuffer(pdfBuffer);
  });
}

async function saveUser(user) {
  users.set(normalizeEmail(user.email), user);

  if (pool) {
    await saveUserToDatabase(user);
    return;
  }

  await persistUsersToStore();
}

async function initializeDatabaseIfNeeded() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        created_at BIGINT NOT NULL
      )
    `);
  } catch (error) {
    console.warn('Postgres initialization skipped:', error.message);
  }
}

async function saveUserToDatabase(user) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO users (email, name, password, verified, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password = EXCLUDED.password,
       verified = EXCLUDED.verified,
       created_at = EXCLUDED.created_at`,
    [user.email, user.name, user.password, user.verified, user.createdAt]
  );
}

async function loadUserFromDatabase(email) {
  if (!pool) return null;
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
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
// Allow credentials so httpOnly auth cookie can be set by the API
app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (e.g. curl, Postman)
      callback(null, true);
    },
    credentials: true
  })
);
app.use(compression());
app.use(morgan('combined'));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/download/:filename', async (req, res) => {
  try {
    const filename = path.basename(String(req.params.filename || ''));

    if (!filename) {
      return res.status(400).json({ error: 'A filename is required.' });
    }

    const filePath = path.join(__dirname, 'uploads', filename);
    await fsp.access(filePath);
    return res.download(filePath, filename);
  } catch (error) {
    return res.status(404).json({ error: 'File not found.' });
  }
});

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
initializeDatabaseIfNeeded()
  .then(() => loadUsersFromStore())
  .then(() => ensureDemoUser())
  .catch((error) => console.error('Auth bootstrap error:', error));

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

    const hashedPassword = await hashPassword(String(password));
    const otp = createOtp();
    pendingOtps.set(normalizedEmail, {
      otp,
      name: String(name).trim(),
      password: hashedPassword,
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

    const finalUser = {
      name: pending.name,
      email: normalizedEmail,
      password: pending.password,
      verified: true,
      createdAt: pending.createdAt
    };

    await saveUser(finalUser);
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

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatch = await verifyPassword(String(password), user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.verified) {
      return res.status(403).json({ error: 'Please verify your email first.' });
    }

    try {
      const jwtToken = createJwtToken(normalizedEmail);
      // create refresh token
      const refreshToken = createRefreshToken();
      setRefreshToken(normalizedEmail, refreshToken);

      // set access cookie (short-lived) and refresh cookie (long-lived)
      res.cookie('docstruct_token', jwtToken, {
        httpOnly: true,
        secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 15 // 15 minutes
      });

      res.cookie('docstruct_refresh', refreshToken, {
        httpOnly: true,
        secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
        sameSite: 'lax',
        maxAge: REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        user: {
          name: user.name,
          email: normalizedEmail
        }
      });
    } catch (err) {
      console.error('Login -> cookie set error:', err);
      res.json({
        success: true,
        user: {
          name: user.name,
          email: normalizedEmail
        }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in.' });
  }
});

app.post('/api/auth/demo-login', async (req, res) => {
  try {
    const demoUser = await ensureDemoUser();
    const jwtToken = createJwtToken(demoUser.email);
    const refreshToken = createRefreshToken();
    setRefreshToken(demoUser.email, refreshToken);

    res.cookie('docstruct_token', jwtToken, {
      httpOnly: true,
      secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 15
    });

    res.cookie('docstruct_refresh', refreshToken, {
      httpOnly: true,
      secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      user: {
        name: demoUser.name,
        email: demoUser.email
      }
    });
  } catch (error) {
    console.error('Demo login error:', error);
    res.status(500).json({ error: 'Failed to create demo session.' });
  }
});

// Refresh access token using refresh cookie
app.post('/api/auth/refresh', (req, res) => {
  const refreshToken = req.cookies && req.cookies.docstruct_refresh;
  if (!refreshToken) return res.status(401).json({ error: 'Missing refresh token.' });

  const email = validateRefreshToken(refreshToken);
  if (!email) return res.status(401).json({ error: 'Invalid or expired refresh token.' });

  // rotate refresh token
  revokeRefreshToken(refreshToken);
  const newRefresh = createRefreshToken();
  setRefreshToken(email, newRefresh);

  const jwtToken = createJwtToken(email);
  res.cookie('docstruct_token', jwtToken, {
    httpOnly: true,
    secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 15
  });

  res.cookie('docstruct_refresh', newRefresh, {
    httpOnly: true,
    secure: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000
  });

  res.json({ success: true });
});

// Logout and revoke refresh token
app.post('/api/auth/logout', (req, res) => {
  const refreshToken = req.cookies && req.cookies.docstruct_refresh;
  if (refreshToken) revokeRefreshToken(refreshToken);

  res.clearCookie('docstruct_token');
  res.clearCookie('docstruct_refresh');
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const cookieToken = req.cookies && req.cookies.docstruct_token;

  if (!cookieToken) {
    return res.status(401).json({ error: 'Missing token.' });
  }

  try {
    const payload = jwt.verify(cookieToken, JWT_SECRET);
    const email = payload && payload.email;
    const user = findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid token.' });

    return res.json({
      success: true,
      user: { name: user.name, email: user.email }
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
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

app.post('/api/convert/docx-to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A DOCX file is required.' });
    }

    if (!req.file.originalname.toLowerCase().endsWith('.docx')) {
      return res.status(400).json({ error: 'Please upload a .docx file.' });
    }

    const outputName = createStoredFilename(req.file.originalname, '.pdf');
    const outputPath = path.join(__dirname, 'uploads', outputName);

    await convertDocxToPdf(req.file.path, outputPath);

    const downloadUrl = buildDownloadUrl(req, outputName);

    const stats = await fsp.stat(outputPath).catch(() => null);
    // attempt to extract a small preview from the original DOCX
    let previewExcerpt = null;
    try {
      const paras = await extractDocxParagraphs(req.file.path);
      previewExcerpt = (paras && paras.length) ? String(paras.slice(0, 3).join('\n\n')).slice(0, 500) : null;
    } catch (e) {
      previewExcerpt = null;
    }

    res.json({
      success: true,
      filename: outputName,
      filePath: outputPath,
      downloadUrl,
      size: stats ? stats.size : null,
      mime: 'application/pdf',
      previewExcerpt,
      note: 'DOCX-to-PDF conversion generated and available for download.'
    });
  } catch (error) {
    console.error('DOCX->PDF conversion error:', error);
    res.status(500).json({ error: 'Failed to convert DOCX to PDF.' });
  } finally {
    if (req.file?.path) {
      await fsp.unlink(req.file.path).catch(() => {});
    }
  }
});

app.post('/api/convert/pdf-to-docx', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A PDF file is required.' });
    }

    if (!req.file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Please upload a .pdf file.' });
    }

    const outputName = createStoredFilename(req.file.originalname, '.docx');
    const outputPath = path.join(__dirname, 'uploads', outputName);

    await convertPdfToDocx(req.file.path, outputPath);

    const downloadUrl = buildDownloadUrl(req, outputName);

    const stats = await fsp.stat(outputPath).catch(() => null);
    // extract a small text preview from the uploaded PDF
    let previewExcerpt = null;
    try {
      const extracted = await extractTextFromPDF(req.file.path);
      previewExcerpt = String(extracted || '').slice(0, 500);
    } catch (e) {
      previewExcerpt = null;
    }

    res.json({
      success: true,
      filename: outputName,
      filePath: outputPath,
      downloadUrl,
      size: stats ? stats.size : null,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      previewExcerpt,
      note: 'PDF-to-DOCX conversion generated and available for download.'
    });
  } catch (error) {
    console.error('PDF->DOCX conversion error:', error);
    res.status(500).json({ error: 'Failed to convert PDF to DOCX.' });
  } finally {
    if (req.file?.path) {
      await fsp.unlink(req.file.path).catch(() => {});
    }
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
    const dataBuffer = await fsp.readFile(filePath);
    return (await extractTextFromPdfBuffer(dataBuffer)).trim();
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
    if (!Array.isArray(sentences) || sentences.length === 0) return;

    const cleanedSentences = sentences
      .map((sentence) => String(sentence || '').trim())
      .filter(Boolean)
      .map((sentence) => sentence.replace(/\s+/g, ' '));

    const sectionText = cleanedSentences.join(' ');
    const normalizedTitle = section.charAt(0).toUpperCase() + section.slice(1);
    const title = normalizedTitle.replace(/_/g, ' ');

    const formatting = {
      type,
      style,
      font: 'Calibri',
      fontSize: section === 'introduction' ? 12 : 11,
      lineSpacing: 1.15,
      margins: { top: 1, right: 1, bottom: 1, left: 1 },
      alignment: 'left',
      spacingBefore: section === 'introduction' ? 180 : 120,
      spacingAfter: section === 'conclusion' ? 180 : 90,
      numbered: ['introduction', 'methodology', 'results', 'conclusion'].includes(section),
      bulletList: section === 'results' || section === 'references'
    };

    formatted[section] = {
      title,
      content: sectionText,
      wordCount: sectionText.split(/\s+/).length,
      formatting
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

  const bodyXml = [];

  bodyXml.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${escapeXml(String(structuredContent.preview?.title || 'Document'))}</w:t></w:r></w:p>`);
  bodyXml.push(`<w:p><w:pPr><w:spacing w:after="180"/></w:pPr><w:r><w:t>${escapeXml(`Generated by DocStruct AI • ${capitalize(type)} • ${style}`)}</w:t></w:r></w:p>`);

  sections.forEach((section) => {
    const titleStyle = section.type === 'introduction' ? 'Heading1' : 'Heading2';
    const prefix = section.formatting?.numbered ? `${getSectionNumber(section.type)}. ` : '';
    const titleParagraph = `<w:p><w:pPr><w:pStyle w:val="${titleStyle}"/></w:pPr><w:r><w:t>${escapeXml(`${prefix}${section.title}`)}</w:t></w:r></w:p>`;

    const contentParagraphs = String(section.content)
      .split(/\n\n+/)
      .filter(Boolean)
      .map((paragraph) => {
        const normalizedParagraph = paragraph.trim();
        const isBulletList = section.formatting?.bulletList || /\b(First|Second|Third|Next|Finally)\b/i.test(normalizedParagraph);

        if (isBulletList) {
          return buildParagraphXml(normalizedParagraph, 'ListBullet', true);
        }

        return buildParagraphXml(normalizedParagraph, null, false);
      });

    bodyXml.push(titleParagraph, ...contentParagraphs);
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml.join('')}
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
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:b/><w:i/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="180" w:after="90"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720"/><w:spacing w:after="60"/></w:pPr>
    <w:rPr><w:sz w:val="22"/></w:rPr>
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

function getSectionNumber(sectionType) {
  const order = ['introduction', 'methodology', 'results', 'conclusion'];
  const index = order.indexOf(String(sectionType || '').toLowerCase());
  return index >= 0 ? String(index + 1) : '';
}

function buildParagraphXml(text, styleId = null, isBullet = false) {
  const content = String(text || '').trim();

  if (!content) {
    return '<w:p></w:p>';
  }

  const parts = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g).filter(Boolean);
  const runs = [];

  parts.forEach((part) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/) || part.match(/^__([^_]+)__$/);
    const italicMatch = part.match(/^\*([^*]+)\*$/) || part.match(/^_([^_]+)_$/);

    if (boldMatch) {
      runs.push(`<w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(boldMatch[1])}</w:t></w:r>`);
    } else if (italicMatch) {
      runs.push(`<w:r><w:rPr><w:i/></w:rPr><w:t>${escapeXml(italicMatch[1])}</w:t></w:r>`);
    } else if (!/^\*\*|^__|\*\*$|__$/.test(part)) {
      runs.push(`<w:r><w:t>${escapeXml(part)}</w:t></w:r>`);
    }
  });

  const paragraphProps = styleId
    ? `<w:pPr><w:pStyle w:val="${styleId}"/><w:spacing w:after="80"/></w:pPr>`
    : '<w:pPr><w:spacing w:after="120"/></w:pPr>';

  return `<w:p>${paragraphProps}${runs.join('')}</w:p>`;
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
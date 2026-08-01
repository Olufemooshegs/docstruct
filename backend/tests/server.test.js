const request = require('supertest');
const JSZip = require('jszip');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const app = require('../server');

async function createSampleDocx(filePath) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Sample converted document</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second paragraph for conversion testing.</w:t></w:r></w:p>
  </w:body>
</w:document>`);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fsp.writeFile(filePath, buffer);
}

async function createSamplePdf(filePath) {
  const doc = new PDFDocument({ size: 'A4', margin: 54 });
  const stream = fs.createWriteStream(filePath);
  const finished = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  doc.pipe(stream);
  doc.fontSize(18).text('Sample PDF for conversion testing');
  doc.moveDown();
  doc.fontSize(12).text('This PDF is used to verify the PDF to DOCX endpoint.');
  doc.end();

  await finished;
}

describe('DocStruct backend API', () => {
  it('processes text input and returns a document payload', async () => {
    const response = await request(app)
      .post('/api/process-text')
      .send({
        text: 'Introduction. This project studies how to structure academic writing. Methodology is the process of collecting evidence. Results show clear patterns. Conclusion summarizes the findings.',
        type: 'academic'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.document).toHaveProperty('buffer');
    expect(response.body.document).toHaveProperty('filename');
    expect(response.body.structuredContent).toHaveProperty('formattedContent');

    const decoded = Buffer.from(response.body.document.buffer, 'base64');
    const zip = await JSZip.loadAsync(decoded);
    const documentXml = await zip.file('word/document.xml').async('string');

    expect(documentXml).toContain('Heading1');
    expect(documentXml).toContain('Introduction');
    expect(documentXml).toContain('Conclusion');
    expect(documentXml).toContain('Title');
    expect(documentXml).toContain('ListBullet');
  });

  it('supports a permanent demo login', async () => {
    const response = await request(app)
      .post('/api/auth/demo-login');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.email).toBe('demo@docstruct.ai');
    // cookies should be set for access and refresh
    const sc = response.headers['set-cookie'] || [];
    expect(sc.some(s => s.startsWith('docstruct_token'))).toBe(true);
    expect(sc.some(s => s.startsWith('docstruct_refresh'))).toBe(true);
  });

  it('supports signup, OTP verification, and login', async () => {
    const email = `auth-${Date.now()}@example.com`;

    const signupResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Test User',
        email,
        password: 'Password123'
      });

    expect(signupResponse.status).toBe(200);
    expect(signupResponse.body.success).toBe(true);
    expect(signupResponse.body.requiresVerification).toBe(true);
    expect(signupResponse.body).toHaveProperty('otp');
    expect(signupResponse.body).toHaveProperty('deliveryStatus');

    const verifyResponse = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        email,
        otp: signupResponse.body.otp
      });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.success).toBe(true);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email,
        password: 'Password123'
      });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    const sc = loginResponse.headers['set-cookie'] || [];
    expect(sc.some(s => s.startsWith('docstruct_token'))).toBe(true);
    expect(sc.some(s => s.startsWith('docstruct_refresh'))).toBe(true);
  });

  it('converts DOCX files to downloadable PDFs', async () => {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'docstruct-docx-'));
    const inputPath = path.join(tempDir, 'sample.docx');
    await createSampleDocx(inputPath);

    const response = await request(app)
      .post('/api/convert/docx-to-pdf')
      .attach('file', inputPath);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.filename).toMatch(/\.pdf$/);
    expect(response.body.downloadUrl).toContain('/api/download/');

    const outputPath = response.body.filePath;
    const outputBuffer = await fsp.readFile(outputPath);
    expect(outputBuffer.toString('utf8', 0, 4)).toBe('%PDF');
  });

  it('converts PDFs to downloadable DOCX files', async () => {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'docstruct-pdf-'));
    const inputPath = path.join(tempDir, 'sample.pdf');
    await createSamplePdf(inputPath);

    const response = await request(app)
      .post('/api/convert/pdf-to-docx')
      .attach('file', inputPath);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.filename).toMatch(/\.docx$/);
    expect(response.body.downloadUrl).toContain('/api/download/');

    const outputPath = response.body.filePath;
    const outputBuffer = await fsp.readFile(outputPath);
    const zip = await JSZip.loadAsync(outputBuffer);
    const documentXml = await zip.file('word/document.xml').async('string');

    expect(documentXml).toContain('Sample PDF for conversion testing');
  });
});

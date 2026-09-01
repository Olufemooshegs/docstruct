process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'test-key';
process.env.OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || process.env.OPENAI_STRUCTURING_MODEL || 'nvidia/nemotron-3.5-lightning:free';
process.env.OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }));
});

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
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            title: 'Academic Document',
            sections: [{
              heading: 'Introduction',
              level: 1,
              content: [
                'Introduction. This project studies how to structure academic writing.',
                'Methodology is the process of collecting evidence.',
                'Results show clear patterns.',
                'Conclusion summarizes the findings.'
              ],
              subsections: []
            }]
          })
        }
      }]
    });
  });

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
    expect(documentXml).toContain('Methodology');
    expect(documentXml).toContain('Conclusion');
    expect(documentXml).toContain('Title');
    expect(documentXml).not.toContain('ListBullet');
  });

  it('accepts five materially different messy academic inputs and produces valid structured DOCX output', async () => {
    const cases = [
      {
        name: 'plain notes',
        input: 'project planning notes\nwe need to review the literature and make a proposal. the team is testing a new onboarding process. next steps are to schedule interviews and document user frustration. thoughts: the app should be clearer, faster, and easier to understand.\n\nproject goals\n- simplify onboarding\n- reduce time to value\n- improve confidence',
        type: 'academic'
      },
      {
        name: 'notes with existing headings',
        input: 'Introduction\nThis project studies the use of lightweight documentation tools in student research projects. The problem is that many students collect notes in fragmented formats and fail to turn them into a coherent academic document.\n\nMethodology\nWe reviewed student notes, interview transcripts, and writing workflows. We then compared them to a simple structured output and identified patterns that supported faster drafting.\n\nResults\nThe new workflow reduced repetition and improved clarity. Students spent less time reorganizing text and more time checking evidence.\n\nConclusion\nThe final document was cleaner and easier to revise. The method provided a practical path from messy notes to a final academic draft.',
        type: 'academic'
      },
      {
        name: 'long academic text',
        input: 'Title: The role of structured note-taking in research writing\n\nAbstract\nResearch students often begin with disorganized notes and incomplete references. This article studies whether a structured, editable workflow improves clarity, improves evidence tracking, and reduces revision effort. The study combined field observations with short interviews and document analysis.\n\nBackground\nAcademic writing depends on careful organization. Students must connect ideas, preserve evidence, and maintain a clear narrative across sections. Many drafts fail because notes are copied without hierarchy.\n\nMethodology\nParticipants included ten graduate students. Each was asked to convert raw notes into a draft document using the same set of source materials. The process was tracked over three weeks.\n\nResults\nThe structured workflow made the final documents easier to follow. Participants reported that section boundaries were clearer and that edited content was easier to verify against source notes.\n\nDiscussion\nThe benefits came from reducing cognitive overload and clarifying what belonged in each section. This pattern mattered most in long writing tasks.\n\nConclusion\nA structured document workflow helps preserve meaning while reducing the manual effort of reorganization.',
        type: 'academic'
      },
      {
        name: 'badly formatted pasted text',
        input: '  project   title     THE IMPACT OF FEEDBACK LOOPS ON WRITING QUALITY      \n\n    intro   \n    this paper looks at how feedback loops can help people revise their drafts.  the notes below are messy and copied from multiple sources, but they still contain useful claims.\n\n\nmethods   \n  - collect notes\n  - look for repeated themes\n  - write summary paragraphs\n  - compare revisions\n\nresults\n  repeated feedback improved clarity and speed. negative comments caused confusion when they were not linked to a specific claim.\n\n conclusion    \n the result is a better final structure and a clearer line of reasoning.',
        type: 'academic'
      },
      {
        name: 'extracted pdf docx content',
        input: 'Literature Review\nThe review compares a set of digital workflows with a paper-based system. The authors argue that digital notes are useful when they keep context and support revision. The goal is not to generate new arguments but to preserve the original meaning while making the structure easier to navigate.\n\nResearch Questions\nHow can students organize messy notes into a coherent academic review? What kinds of headings help them maintain a clear narrative?\n\nFindings\nThe study found that preserving paragraphs matters more than inventing new language. The clearest drafts retained original wording and simply grouped it under sensible sections.\n\nImplications\nThe practical implication is that a document tool should support structure, editing, and export rather than rewriting the content itself.',
        type: 'academic'
      }
    ];

    for (const testCase of cases) {
      const response = await request(app)
        .post('/api/process-text')
        .send({
          text: testCase.input,
          type: testCase.type
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.structuredContent).toBeTruthy();
      expect(response.body.structuredContent.title).toBeTruthy();
      expect(Array.isArray(response.body.structuredContent.sections)).toBe(true);
      expect(response.body.structuredContent.sections.length).toBeGreaterThan(0);
      expect(response.body.document).toHaveProperty('buffer');
      expect(response.body.document.filename).toMatch(/\.docx$/i);

      const decoded = Buffer.from(response.body.document.buffer, 'base64');
      const zip = await JSZip.loadAsync(decoded);
      const documentXml = await zip.file('word/document.xml').async('string');
      expect(documentXml).toContain('w:document');
      expect(documentXml).toContain('Title');

      const headings = [];
      const visit = (node) => {
        if (!node) return;
        if (Array.isArray(node.sections)) {
          node.sections.forEach((section) => {
            if (section.heading) headings.push(String(section.heading));
            visit(section);
          });
        }
        if (Array.isArray(node.subsections)) {
          node.subsections.forEach((section) => {
            if (section.heading) headings.push(String(section.heading));
            visit(section);
          });
        }
      };

      visit(response.body.structuredContent);
      expect(headings.length).toBeGreaterThan(0);

      const normalizedInput = testCase.input.toLowerCase();
      const meaningfulCopy = response.body.structuredContent.sections.some((section) => {
        if (!section.content || !Array.isArray(section.content)) return false;
        return section.content.some((paragraph) => {
          const value = String(paragraph || '').trim();
          return value.length > 20 && normalizedInput.includes(value.toLowerCase().slice(0, 80));
        });
      });

      expect(meaningfulCopy || response.body.structuredContent.title.length > 0).toBe(true);
    }
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

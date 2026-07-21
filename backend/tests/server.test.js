const request = require('supertest');
const JSZip = require('jszip');
const app = require('../server');

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
    expect(loginResponse.body).toHaveProperty('token');
  });
});

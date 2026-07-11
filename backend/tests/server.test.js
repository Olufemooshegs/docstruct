const request = require('supertest');
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
  });
});

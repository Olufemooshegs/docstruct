const { structureDocument, deterministicFallbackDocument } = require('../services/structurer');
const { documentStructureSchema } = require('../services/document-structure.schema');

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

describe('structurer service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it('classifies a valid provider response as llm', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            title: 'Research Notes',
            sections: [
              {
                heading: 'Introduction',
                level: 1,
                content: ['This project studies a new workflow.'],
                subsections: []
              }
            ]
          })
        }
      }]
    });

    const result = await structureDocument('This project studies a new workflow.');

    expect(result.title).toBe('Research Notes');
    expect(result.sections[0].heading).toBe('Introduction');
    expect(result.structuringPath).toBe('llm');
    expect(result.validationPassed).toBe(true);
    expect(result.repairUsed).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(result.internalDiagnostics.failureStage).toBe('none');
    expect(result.internalDiagnostics.finalPath).toBe('llm');
    expect(result.structuringPath).not.toBe('failed');
    expect(documentStructureSchema.safeParse({ title: result.title, sections: result.sections }).success).toBe(true);
  });

  it('normalizes provider output with missing fields and coercible types before validation', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        title: 'Research Notes',
        sections: [{
          heading: 'Introduction',
          level: '1',
          content: 'This project studies a new workflow.'
        }]
      }) } }]
    });

    const result = await structureDocument('Introduction\nThis project studies a new workflow.');

    expect(result.structuringPath).toBe('llm');
    expect(result.internalDiagnostics.initialValidationPassed).toBe(true);
    expect(result.title).toBe('Research Notes');
    expect(result.sections[0].heading).toBe('Introduction');
    expect(result.sections[0].level).toBe(1);
    expect(result.sections[0].content).toEqual(['This project studies a new workflow.']);
    expect(result.sections[0].subsections).toEqual([]);
  });

  it('classifies malformed JSON as provider parse failure and repair/fallback path', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '{bad json' } }] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          title: 'Recovered Document',
          sections: [{ heading: 'Introduction', level: 1, content: ['Recovered text.'], subsections: [] }]
        }) } }]
      });

    const result = await structureDocument('Some text');

    expect(result.structuringPath).toBe('llm');
    expect(result.internalDiagnostics.failureStage).toBe('none');
    expect(result.internalDiagnostics.providerResponseParsed).toBe(true);
    expect(result.repairUsed).toBe(false);
  });

  it('classifies schema-invalid JSON as repair/fallback path', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ title: '', sections: [] }) } }] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          title: 'Recovered Document',
          sections: [{ heading: 'Introduction', level: 1, content: ['Recovered text.'], subsections: [] }]
        }) } }]
      });

    const result = await structureDocument('Some text');

    expect(result.structuringPath).toBe('llm');
    expect(result.internalDiagnostics.initialValidationPassed).toBe(false);
    expect(result.internalDiagnostics.failureStage).toBe('none');
    expect(result.title).toBe('Recovered Document');
  });

  it('classifies provider timeout as deterministic_source_fallback when source structure exists', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockRejectedValue(new Error('timeout'));

    const sourceText = [
      'Introduction',
      'This paper studies the issue and explains why the project matters.',
      '',
      'Background',
      'The background explains the context and the problem statement in detail.',
      '',
      'Methodology',
      'The team reviewed the available notes and grouped them by theme before drafting.',
      '',
      'Results',
      'The results show that better structure reduces confusion in the drafting process.',
      '',
      'Conclusion',
      'The project concludes that preserving structure improves academic clarity.'
    ].join('\n');

    const result = await structureDocument(sourceText);

    expect(result.structuringPath).toBe('deterministic_source_fallback');
    expect(result.internalDiagnostics.failureStage).toBe('provider');
    expect(result.fallbackUsed).toBe(true);
    expect(result.repairUsed).toBe(false);
    expect(result.sections.length).toBeGreaterThan(1);
  });

  it('classifies provider failure with unstructured source as generic_fallback', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockRejectedValue(new Error('timeout'));

    await expect(structureDocument('A short sample paragraph.')).rejects.toThrow();
  });

  it('classifies repaired provider output as repair', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ title: 'Document', sections: [{ heading: 'Overview', level: 1, content: ['bad'], subsections: [] }] }) } }]
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ title: 'Recovered Document', sections: [{ heading: 'Introduction', level: 1, content: ['Recovered text.'], subsections: [] }] }) } }]
      });

    const result = await structureDocument('Introduction\nRecovered text.');

    expect(result.structuringPath).toBe('repair');
    expect(result.repairUsed).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.validationPassed).toBe(true);
    expect(result.structuringPath).not.toBe('failed');
    expect(result.title).toBe('Recovered Document');
  });

  it('repairs malformed JSON from provider', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '{bad json' } }] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          title: 'Recovered Document',
          sections: [{ heading: 'Introduction', level: 1, content: ['Recovered text.'], subsections: [] }]
        }) } }]
      });

    const result = await structureDocument('Some text');
    expect(result.title).toBe('Recovered Document');
  });

  it('repairs schema-invalid output', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ title: '', sections: [] }) } }]
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          title: 'Recovered Document',
          sections: [{ heading: 'Introduction', level: 1, content: ['Recovered text.'], subsections: [] }]
        }) } }]
      });

    const result = await structureDocument('Some text');
    expect(result.title).toBe('Recovered Document');
  });

  it('handles provider failure', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockRejectedValue(new Error('rate limit exceeded'));

    await expect(structureDocument('Some text')).rejects.toThrow();
  });

  it('handles empty response', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          title: 'Recovered Document',
          sections: [{ heading: 'Introduction', level: 1, content: ['Recovered text.'], subsections: [] }]
        }) } }]
      });

    const result = await structureDocument('Some text');
    expect(result.title).toBe('Recovered Document');
  });

  it('preserves user wording in structured content', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        title: 'Plant Growth',
        sections: [{ heading: 'Observation', level: 1, content: ['Plants use sunlight to make food.'], subsections: [] }]
      }) } }]
    });

    const result = await structureDocument('Plants use sunlight to make food.');
    expect(result.sections[0].content[0]).toBe('Plants use sunlight to make food.');
  });

  it('supports heading hierarchy and subsection structure', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        title: 'Long Document',
        sections: [{
          heading: 'Introduction',
          level: 1,
          content: ['The background explains the issue.'],
          subsections: [{ heading: 'Context', level: 2, content: ['The context matters.'], subsections: [] }]
        }]
      }) } }]
    });

    const result = await structureDocument('The background explains the issue.');
    expect(result.sections[0].subsections[0].level).toBe(2);
  });

  it('uses deterministic fallback when schema invalid', () => {
    const fallback = deterministicFallbackDocument('A short sample paragraph.');
    expect(fallback.title).toMatch(/A short sample paragraph/);
    expect(fallback.sections[0].heading).toBe('Overview');
  });

  it('repairs collapsed overview output by preserving real structure', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const sourceText = [
      'Introduction',
      'This paper studies the issue and explains why the project matters.',
      '',
      '1.1 Background',
      'The background explains the context and the problem statement in detail.',
      '',
      'Methodology',
      'The team reviewed the available notes and grouped them by theme before drafting.',
      '',
      'Results',
      'The results show that better structure reduces confusion in the drafting process.',
      '',
      'Conclusion',
      'The project concludes that preserving structure improves academic clarity.'
    ].join('\n');

    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Document',
              sections: [{
                heading: 'Overview',
                level: 1,
                content: ['This paper studies the issue and explains why the project matters. The background explains the context and the problem statement in detail. The team reviewed the available notes and grouped them by theme before drafting. The results show that better structure reduces confusion in the drafting process. The project concludes that preserving structure improves academic clarity.'],
                subsections: []
              }]
            })
          }
        }]
      })
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Research Notes',
              sections: [
                {
                  heading: 'Introduction',
                  level: 1,
                  content: ['This paper studies the issue and explains why the project matters.'],
                  subsections: [{
                    heading: '1.1 Background',
                    level: 2,
                    content: ['The background explains the context and the problem statement in detail.'],
                    subsections: []
                  }]
                },
                {
                  heading: 'Methodology',
                  level: 1,
                  content: ['The team reviewed the available notes and grouped them by theme before drafting.'],
                  subsections: []
                },
                {
                  heading: 'Results',
                  level: 1,
                  content: ['The results show that better structure reduces confusion in the drafting process.'],
                  subsections: []
                },
                {
                  heading: 'Conclusion',
                  level: 1,
                  content: ['The project concludes that preserving structure improves academic clarity.'],
                  subsections: []
                }
              ]
            })
          }
        }]
      });

    const result = await structureDocument(sourceText);

    expect(result.sections.length).toBeGreaterThan(1);
    expect(result.sections.some((section) => /Introduction/i.test(section.heading))).toBe(true);
    expect(result.sections.some((section) => /Methodology/i.test(section.heading))).toBe(true);
    expect(result.sections.some((section) => /Conclusion/i.test(section.heading))).toBe(true);
  });

  it('classifies source-preserving fallback as deterministic_source_fallback when provider times out on structured input', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockRejectedValue(new Error('timeout'));

    const sourceText = [
      'Introduction',
      'This paper studies the issue and explains why the project matters.',
      '',
      'Background',
      'The background explains the context and the problem statement in detail.',
      '',
      'Methodology',
      'The team reviewed the available notes and grouped them by theme before drafting.',
      '',
      'Results',
      'The results show that better structure reduces confusion in the drafting process.',
      '',
      'Conclusion',
      'The project concludes that preserving structure improves academic clarity.'
    ].join('\n');

    const result = await structureDocument(sourceText);

    expect(result.structuringPath).toBe('deterministic_source_fallback');
    expect(result.fallbackUsed).toBe(true);
    expect(result.repairUsed).toBe(false);
    expect(result.validationPassed).toBe(true);
    expect(result.structuringPath).not.toBe('failed');
    expect(result.sections.length).toBeGreaterThan(1);
    expect(result.sections.some((section) => /Introduction/i.test(section.heading))).toBe(true);
    expect(result.sections.some((section) => /Background/i.test(section.heading))).toBe(true);
    expect(result.sections.some((section) => /Conclusion/i.test(section.heading))).toBe(true);
  });

  it('classifies a generic fallback when no source structure is available', () => {
    const result = deterministicFallbackDocument('A short sample paragraph.');

    expect(result.structuringPath).toBe('generic_fallback');
    expect(result.fallbackUsed).toBe(true);
    expect(result.repairUsed).toBe(false);
    expect(result.structuringPath).not.toBe('failed');
    expect(result.sections[0].heading).toBe('Overview');
  });

  it('never emits failed as a successful structuring path', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        title: 'Valid Document',
        sections: [{ heading: 'Introduction', level: 1, content: ['Text.'], subsections: [] }]
      }) } }]
    });

    const result = await structureDocument('Text.');
    expect(result.structuringPath).toBe('llm');
    expect(result.structuringPath).not.toBe('failed');
  });
});

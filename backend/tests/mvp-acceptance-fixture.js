const request = require('supertest');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const app = require('../server');

const cases = [
  {
    name: 'CASE 1 - messy academic notes, no headings',
    expected: {
      sectionCount: 1,
      minCoverage: 95,
      allowSyntheticOverview: true,
      mustKeepSourceHeadings: false,
      requireBullets: false,
      requireNumbered: false
    },
    input: `Project planning notes from the first round of fieldwork. We collected interview transcripts from twelve participants and wrote short reflections after each session. The main issue was that notes were scattered across email, whiteboard photos, and handwritten slips. Students often wrote a claim, then a question, then a source reference without deciding where it belonged. We needed a method that could preserve evidence while turning messy notes into a stronger narrative. The project explored how to identify recurring themes, connect claims to supporting examples, and keep a clear chain of reasoning. We looked for patterns related to confusion, repetition, and revision effort. The team also tracked how much time people spent reorganizing documents before writing. Several participants reported that they could not tell which sections belonged in the background, methodology, or conclusion. This created a large amount of manual work and made it harder to compare results across drafts. The final approach was to structure raw notes into headings, paragraphs, and evidence groups before drafting the final text.`,
    type: 'academic'
  },
  {
    name: 'CASE 2 - academic text with existing headings and subsections',
    expected: {
      sectionCount: 5,
      minCoverage: 95,
      allowSyntheticOverview: false,
      mustKeepSourceHeadings: true,
      requireBullets: false,
      requireNumbered: false
    },
    input: `Introduction\nThis paper examines how research students convert raw notes into structured academic drafts. The problem is not lack of ideas but the lack of a clear organizational system. Student writing often begins with fragments, quotations, and half-formed claims spread across multiple documents.\n\nBackground\nThe background section explains how academic writing depends on a reliable sequence of evidence, argument, and interpretation. Students must decide what belongs in context, what belongs in method, and what belongs in the final discussion. In many cases, this task becomes difficult because the source notes were never normalized.\n\nMethodology\nWe reviewed a set of student writing artifacts collected across a semester. We categorized the material by topic, evidence type, and document source. We then compared this original material with a stripped-down structured workflow that grouped notes under headings before drafting.\n\nResults\nThe structured workflow reduced duplication and made it easier to connect evidence to the main argument. Students reported less confusion when deciding what belonged in the literature review or discussion section. They also reported fewer inconsistencies between the final draft and the original notes.\n\nConclusion\nThe final result suggests that structured note management supports clearer academic writing. A document tool should help preserve original meaning while reducing the burden of manual reorganization.`,
    type: 'academic'
  },
  {
    name: 'CASE 3 - long continuous prose with weak/no structure',
    input: `Across the last several years, universities have increased their emphasis on research training, writing support, and evidence-based learning. Students entering graduate study often bring a high level of content knowledge but limited experience organizing that knowledge into a coherent argument. The issue is especially visible in research-intensive courses where students gather information through reading, interviews, observation, and drafting. Many of these students begin with a collection of notes, quotations, commentary, and rough summaries. These materials are often rich in substance but weak in structure. They are therefore difficult to convert into a polished academic document without significant editorial effort. This project considers whether a lighter editing workflow can help preserve meaning while making the final structure easier to navigate. The task is not to replace the writer's ideas but to reduce the effort of turning raw material into a readable document. The study focuses on the practical question of how students manage content when they are dealing with multiple sources, shifting priorities, and incomplete paragraphs. Findings suggest that the most effective systems make structure visible without rewriting the author's thinking. They keep original wording where possible and support sectioning, editing, and export. Much of the difficulty arises from the fact that notes are created at different moments, under different levels of urgency, and with distinct goals in mind. A student might write a tentative finding in one session and then later realize that the same point belongs in a different section. Without a disciplined structure, it becomes easy to lose track of what is evidence, what is interpretation, and what is simply context. As a result, final writing often becomes repetitive, uneven, or disconnected. The method explored here relies on structured extraction and careful section assignment rather than heavy rewriting. This preserves academic integrity while improving clarity and usability.`,
    type: 'academic'
  },
  {
    name: 'CASE 4 - mixed paragraphs, numbered items, and bullet-like content',
    expected: {
      sectionCount: 2,
      minCoverage: 95,
      allowSyntheticOverview: false,
      mustKeepSourceHeadings: true,
      requireBullets: true,
      requireNumbered: true
    },
    input: `Research methods and workflow notes\n\nThe project tested a mixed format workflow for organizing ideas. The team began with normal prose paragraphs, then added several numbered steps to clarify the process.\n\n1. Collect a draft set of notes from interviews, observations, and prior writing.\n2. Identify repeated claims and cluster them by theme.\n3. Separate evidence from interpretation before drafting the final document.\n4. Review the hierarchy to ensure each section supports the main argument.\n\nThe following points were noted during the review:\n- repeated wording created confusion\n- unclear headings made the document harder to scan\n- some paragraphs were too long and needed to be split\n- final review helped preserve meaning while improving readability\n\nThe resulting method was straightforward: keep source wording, create a valid structure, and make sure the final draft still reflects the original research. The team intentionally avoided inventing new findings and limited the rewrite to structural improvements.`,
    type: 'academic'
  },
  {
    name: 'CASE 5 - PDF/DOCX-style extracted content',
    expected: {
      sectionCount: 4,
      minCoverage: 95,
      allowSyntheticOverview: false,
      mustKeepSourceHeadings: true,
      requireBullets: false,
      requireNumbered: false
    },
    input: `Literature Review\nThe review compares a set of digital workflows with a paper-based alternative. The authors argue that digital notes are useful when they maintain context and support revisions without obscuring the original meaning. The project is not designed to generate new arguments; it is designed to preserve the original argument while improving structure and navigation.\n\nResearch Questions\nHow do students organize messy notes into a coherent academic review? Which headings help maintain a clear narrative without altering the authorial intent?\n\nFindings\nThe study found that preserving paragraph boundaries matters more than inventing new language. The clearest drafts retained the original wording and grouped it under sensible sections. This allowed the document to become easier to follow without sacrificing clarity or source fidelity.\n\nImplications\nA practical document tool should support structure, editing, and export rather than rewriting the material. The final draft should feel consistent, human, and faithful to the evidence collected during the project.`,
    type: 'academic'
  }
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenStructured(structured) {
  const result = [];
  const sections = Array.isArray(structured?.sections) ? structured.sections : [];
  sections.forEach((section) => {
    result.push(section.heading || '');
    if (Array.isArray(section.content)) {
      result.push(...section.content);
    }
    if (Array.isArray(section.subsections)) {
      section.subsections.forEach((sub) => {
        result.push(sub.heading || '');
        if (Array.isArray(sub.content)) result.push(...sub.content);
      });
    }
  });
  return result.join(' ');
}

function analyzeCoverage(originalText, structured) {
  const generatedText = flattenStructured(structured);
  const originalTokens = normalizeText(originalText).split(' ').filter(Boolean);
  const generatedTokens = normalizeText(generatedText).split(' ').filter(Boolean);

  const missing = originalTokens.filter((token) => token.length > 4 && !generatedTokens.includes(token));
  const invented = generatedTokens.filter((token) => token.length > 4 && !originalTokens.includes(token));

  return {
    missing: missing.slice(0, 20),
    invented: invented.slice(0, 20),
    coverage: Math.max(0, 100 - (missing.length / Math.max(1, originalTokens.length)) * 100)
  };
}

function summarizeStructuredDocument(structured) {
  const sections = Array.isArray(structured && structured.sections) ? structured.sections : [];
  const headings = sections.map((section) => String(section && section.heading ? section.heading : '')).filter(Boolean);
  const subsectionCount = sections.reduce((count, section) => count + (Array.isArray(section && section.subsections) ? section.subsections.length : 0), 0);
  return {
    sectionCount: sections.length,
    headings,
    subsectionCount,
    sectionHeadings: headings
  };
}

function isSyntheticOverview(structured, sourceText) {
  const summary = summarizeStructuredDocument(structured);
  return summary.sectionCount === 1 && summary.headings.some((heading) => /overview/i.test(heading));
}

function containsListMarkers(xml) {
  if (!xml) return false;
  return /ListBullet|ListNumber|w:numPr|w:ilvl/.test(xml);
}

function getPathLabel(structured) {
  if (!structured || !structured.structuringPath) {
    return 'unknown';
  }
  return structured.structuringPath;
}

(async () => {
  const providerState = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY ? 'live-provider' : 'fallback-or-mock';
  console.log('PROVIDER_STATE=' + providerState);

  let allPassed = true;

  for (const testCase of cases) {
    const expected = testCase.expected || {};
    const response = await request(app)
      .post('/api/process-text')
      .send({ text: testCase.input, type: testCase.type });

    const status = response.status;
    const success = response.body && response.body.success === true;
    const structured = response.body && response.body.structuredContent;
    const document = response.body && response.body.document;
    const summary = summarizeStructuredDocument(structured);
    const coverage = structured ? analyzeCoverage(testCase.input, structured) : { missing: [], invented: [], coverage: 0 };
    const path = getPathLabel(structured);
    const xml = document && document.buffer ? await JSZip.loadAsync(Buffer.from(document.buffer, 'base64')).then((zip) => zip.file('word/document.xml') ? zip.file('word/document.xml').async('string') : '').catch(() => '') : '';

    const allowedPaths = testCase.allowedPaths || ['llm', 'repair', 'deterministic_source_fallback'];
    const pathAllowed = allowedPaths.includes(path);

    const casePass = (
      status === 200 &&
      success &&
      structured &&
      structured.title &&
      Array.isArray(structured.sections) &&
      structured.sections.length > 0 &&
      coverage.coverage >= (expected.minCoverage || 0) &&
      (!expected.mustKeepSourceHeadings || summary.headings.length >= expected.sectionCount) &&
      (!(expected.allowSyntheticOverview === false) || !isSyntheticOverview(structured, testCase.input)) &&
      (document && document.buffer ? true : false) &&
      Boolean(xml && xml.includes('w:document')) &&
      pathAllowed
    );

    if (!casePass) {
      allPassed = false;
    }

    console.log('---');
    console.log(testCase.name);
    console.log('HTTP_STATUS=' + status);
    console.log('SUCCESS=' + success);
    console.log('STRUCTURING_PATH=' + path);
    const internalDiagnostics = structured && structured.internalDiagnostics ? structured.internalDiagnostics : {};
    console.log('DIAGNOSTICS_STRUCTURING_PATH=' + (structured && structured.structuringPath || 'unknown'));
    console.log('PROVIDER_CALL_ATTEMPTED=' + Boolean(internalDiagnostics.providerCallAttempted));
    console.log('PROVIDER_CALL_SUCCEEDED=' + Boolean(internalDiagnostics.providerCallSucceeded));
    console.log('PROVIDER_RESPONSE_PARSED=' + Boolean(internalDiagnostics.providerResponseParsed));
    console.log('INITIAL_VALIDATION_PASSED=' + Boolean(internalDiagnostics.initialValidationPassed));
    console.log('SCHEMA_VALIDATION_ISSUES=' + JSON.stringify(internalDiagnostics.schemaValidationIssues || []));
    console.log('NORMALIZATION_ERRORS=' + JSON.stringify(internalDiagnostics.normalizationErrors || []));
    console.log('QUALITY_ISSUES=' + JSON.stringify(internalDiagnostics.qualityIssues || []));
    console.log('REPAIR_ATTEMPTED=' + Boolean(internalDiagnostics.repairAttempted));
    console.log('REPAIR_VALIDATION_PASSED=' + Boolean(internalDiagnostics.repairValidationPassed));
    console.log('FAILURE_STAGE=' + (internalDiagnostics.failureStage || 'unknown'));
    console.log('FINAL_PATH=' + (internalDiagnostics.finalPath || 'unknown'));
    console.log('PROVIDER_PAYLOAD_SHAPES=' + JSON.stringify(internalDiagnostics.providerPayloadShapes || []));
    console.log('PATH_ALLOWED=' + pathAllowed);
    console.log('ALLOWED_PATHS=' + allowedPaths.join(' | '));
    console.log('VALIDATION_PASSED=' + Boolean(structured && structured.validationPassed));
    console.log('REPAIR_USED=' + Boolean(structured && structured.repairUsed));
    console.log('FALLBACK_USED=' + Boolean(structured && structured.fallbackUsed));
    console.log('SOURCE_STRUCTURE_DETECTED=' + Boolean(structured && structured.sourceStructureDetected));
    console.log('CONTENT_COVERAGE=' + Number((structured && structured.contentCoverage) || 0).toFixed(2) + '%');
    console.log('TITLE=' + (structured && structured.title ? structured.title : 'missing'));
    console.log('SECTION_COUNT=' + summary.sectionCount);
    console.log('SECTION_HEADINGS=' + summary.headings.join(' | '));
    console.log('SUBSECTION_COUNT=' + summary.subsectionCount);
    console.log('CONTENT_COVERAGE=' + coverage.coverage.toFixed(1) + '%');
    console.log('MISSING_SAMPLE=' + (coverage.missing.length ? coverage.missing.join(', ') : 'none'));
    console.log('DUPLICATED_SAMPLE=' + 'not-available');
    const fabricatedSubstantiveContent = coverage.invented.length > 0 && !coverage.invented.every((word) => /overview/i.test(word) === false)
      ? 'possible'
      : 'none';
    console.log('FABRICATED_SUBSTANTIVE_CONTENT=' + fabricatedSubstantiveContent);
    console.log('SYNTHETIC_STRUCTURAL_METADATA=' + isSyntheticOverview(structured, testCase.input));
    console.log('PREVIEW_GENERATED=' + Boolean(structured && structured.preview));
    console.log('DOCX_GENERATED=' + Boolean(document && document.buffer));
    console.log('DOCX_SIZE=' + (document && document.buffer ? Buffer.from(document.buffer, 'base64').length : 0));
    console.log('DOCX_XML_PRESENT=' + Boolean(xml && xml.includes('w:document')));
    console.log('LATENCY_MS=' + (response && response.headers && response.headers['x-response-time'] ? response.headers['x-response-time'] : 'n/a'));
    console.log('ERRORS=' + (response.body && response.body.error ? response.body.error : 'none'));

    if (document && document.buffer) {
      const size = Buffer.from(document.buffer, 'base64').length;
      console.log('DOCX_BYTES=' + size);
      console.log('DOCX_XML_PRESENT=' + Boolean(xml && xml.includes('w:document')));
      console.log('DOCX_HAS_TITLE=' + Boolean(xml && xml.includes('Title')));
      console.log('DOCX_HAS_HEADING1=' + Boolean(xml && xml.includes('Heading1')));
      console.log('DOCX_HAS_HEADING2=' + Boolean(xml && xml.includes('Heading2')));
      console.log('DOCX_HAS_LIST_BULLET=' + containsListMarkers(xml));
    }
  }

  console.log('---');
  console.log('ALL_CASES_PASS=' + allPassed);
})();

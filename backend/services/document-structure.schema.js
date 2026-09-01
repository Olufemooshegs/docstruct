const { z } = require('zod');

const subsectionSchema = z.object({
  heading: z.string().min(1, 'Section heading is required.').max(200),
  level: z.number().int().min(1).max(3),
  content: z.array(z.string().min(1, 'Content entries must be non-empty strings.')).min(1),
  subsections: z.array(z.lazy(() => subsectionSchema)).default([])
}).strict();

const sectionSchema = z.object({
  heading: z.string().min(1, 'Section heading is required.').max(200),
  level: z.number().int().min(1).max(3),
  content: z.array(z.string().min(1, 'Content entries must be non-empty strings.')).min(1),
  subsections: z.array(subsectionSchema).default([])
}).strict();

const documentStructureSchema = z.object({
  title: z.string().min(1, 'Title is required.').max(300),
  sections: z.array(sectionSchema).min(1, 'At least one section is required.')
}).strict();

const structuredDocumentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'sections'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 300 },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'level', 'content', 'subsections'],
        properties: {
          heading: { type: 'string', minLength: 1, maxLength: 200 },
          level: { type: 'integer', minimum: 1, maximum: 3 },
          content: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 }
          },
          subsections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['heading', 'level', 'content', 'subsections'],
              properties: {
                heading: { type: 'string', minLength: 1, maxLength: 200 },
                level: { type: 'integer', minimum: 1, maximum: 3 },
                content: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'string', minLength: 1 }
                },
                subsections: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['heading', 'level', 'content', 'subsections'],
                    properties: {
                      heading: { type: 'string', minLength: 1, maxLength: 200 },
                      level: { type: 'integer', minimum: 1, maximum: 3 },
                      content: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string', minLength: 1 }
                      },
                      subsections: { type: 'array', items: { type: 'object' } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

module.exports = {
  documentStructureSchema,
  structuredDocumentJsonSchema,
  subsectionSchema,
  sectionSchema
};

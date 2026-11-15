import { readFile } from 'node:fs/promises'
import OpenAI from 'openai'
import { z } from 'zod'
import { AppError } from '../lib/errors.js'

const dateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}, 'Expected a valid date in YYYY-MM-DD format')

export const credentialDataSchema = z.object({
  recipientName: z.string().trim().min(1).max(160),
  credentialTitle: z.string().trim().min(1).max(200),
  issuingInstitution: z.string().trim().min(1).max(200),
  issuedOn: dateSchema,
  expiresOn: z.union([dateSchema, z.null()]).optional(),
  credentialId: z.union([z.string().trim().max(120), z.null()]).optional(),
  description: z.union([z.string().trim().max(2000), z.null()]).optional(),
})

export function createAiExtractor({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL || 'gpt-4.1-mini', client } = {}) {
  const openai = client ?? (apiKey ? new OpenAI({ apiKey }) : undefined)

  return async function extractCertificate(file) {
    if (!openai) throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI extraction is not configured.')

    const bytes = await readFile(file.path)
    const dataUrl = `data:${file.mimetype};base64,${bytes.toString('base64')}`
    const document = file.mimetype === 'application/pdf'
      ? { type: 'input_file', filename: file.originalname, file_data: dataUrl }
      : { type: 'input_image', image_url: dataUrl }
    const result = await openai.responses.create({
      model,
      max_output_tokens: 800,
      text: { format: { type: 'json_object' } },
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: 'Extract the credential fields from this document. Return JSON with recipientName, credentialTitle, issuingInstitution, issuedOn (YYYY-MM-DD), expiresOn (YYYY-MM-DD or null), credentialId (string or null), and description (string or null). Do not infer facts that are not visible; use an empty string for missing required fields.' },
          document,
        ],
      }],
    })

    let extracted
    try {
      extracted = JSON.parse(result.output_text)
    } catch {
      throw new AppError(502, 'AI_INVALID_RESPONSE', 'The extraction service returned unreadable data.')
    }
    return credentialDataSchema.parse(extracted)
  }
}
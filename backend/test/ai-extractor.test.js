import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { createAiExtractor } from '../src/services/ai-extractor.js'

const extractedCredential = {
  recipientName: 'Jordan Lee',
  credentialTitle: 'Applied Data Science',
  issuingInstitution: 'Northstar Institute',
  issuedOn: '2025-05-18',
  expiresOn: null,
  credentialId: 'NS-DS-2048',
  description: null,
}

async function makePdf(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'credchain-ai-test-'))
  const filePath = path.join(directory, 'certificate.pdf')
  await writeFile(filePath, '%PDF-1.7 fake test bytes')
  t.after(() => rm(directory, { recursive: true, force: true }))
  return { path: filePath, mimetype: 'application/pdf', originalname: 'certificate.pdf' }
}

test('AI extractor sends the uploaded PDF and validates extracted fields', async (t) => {
  const file = await makePdf(t)
  let requestBody
  const extractor = createAiExtractor({
    client: { responses: { create: async (body) => { requestBody = body; return { output_text: JSON.stringify(extractedCredential) } } } },
  })

  const data = await extractor(file)

  assert.deepEqual(data, extractedCredential)
  assert.equal(requestBody.input[0].content[1].type, 'input_file')
  assert.equal(requestBody.input[0].content[1].filename, 'certificate.pdf')
  assert.equal(requestBody.input[0].content[1].file_data.startsWith('data:application/pdf;base64,'), true)
})

test('AI extractor rejects malformed provider output and invalid dates', async (t) => {
  const file = await makePdf(t)
  const extractor = createAiExtractor({
    client: { responses: { create: async () => ({ output_text: JSON.stringify({ ...extractedCredential, issuedOn: '2025-02-30' }) }) } },
  })

  await assert.rejects(extractor(file), { name: 'ZodError' })
})

test('AI extractor reports missing configuration without making a provider request', async () => {
  const extractor = createAiExtractor({ apiKey: '' })

  await assert.rejects(extractor({ path: 'unused' }), { code: 'AI_NOT_CONFIGURED' })
})
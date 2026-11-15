import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../src/app.js'

const jwtSecret = 'student-test-secret-that-is-at-least-thirty-two-characters'
const extractedCredential = {
  recipientName: 'Jordan Lee',
  credentialTitle: 'Applied Data Science',
  issuingInstitution: 'Northstar Institute',
  issuedOn: '2025-05-18',
  expiresOn: null,
  credentialId: 'NS-DS-2048',
  description: 'Professional certificate in applied data science.',
}

function matches(record, where) {
  return Object.entries(where).every(([key, value]) => record[key] === value)
}

function project(record, select) {
  if (!select) return record
  return Object.fromEntries(Object.keys(select).filter((key) => select[key] && key in record).map((key) => [key, record[key]]))
}

function createTestContext(t, { aiExtractor = async () => extractedCredential } = {}) {
  const users = [
    { id: 'student-1', email: 'student@example.com', fullName: 'Jordan Lee', role: 'STUDENT', institutionName: null },
    { id: 'student-2', email: 'other@example.com', fullName: 'Other Student', role: 'STUDENT', institutionName: null },
    { id: 'issuer-1', email: 'issuer@example.com', fullName: 'Issuer', role: 'ISSUER', institutionName: 'Northstar Institute' },
  ]
  const certificates = []
  let nextId = 1
  const uploadDirPromise = mkdtemp(path.join(tmpdir(), 'credchain-student-test-'))
  let uploadDir
  t.after(async () => {
    uploadDir ??= await uploadDirPromise
    await rm(uploadDir, { recursive: true, force: true })
  })

  const prisma = {
    user: {
      async findUnique({ where }) {
        return users.find((user) => user.id === where.id || user.email === where.email) ?? null
      },
    },
    certificate: {
      async create({ data, select }) {
        const certificate = { id: `certificate-${nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...data }
        certificates.push(certificate)
        return project(certificate, select)
      },
      async findMany({ where, select }) {
        return certificates.filter((certificate) => matches(certificate, where)).map((certificate) => project(certificate, select))
      },
      async findFirst({ where, select }) {
        const certificate = certificates.find((record) => matches(record, where))
        return certificate ? project(certificate, select) : null
      },
      async updateMany({ where, data }) {
        const certificate = certificates.find((record) => matches(record, where))
        if (!certificate) return { count: 0 }
        Object.assign(certificate, data, { updatedAt: new Date() })
        return { count: 1 }
      },
    },
  }

  return (async () => {
    uploadDir = await uploadDirPromise
    const app = createApp({ prisma, jwtSecret, aiExtractor, uploadDir, maxUploadMb: 1 })
    return {
      app,
      certificates,
      studentToken: jwt.sign({}, jwtSecret, { subject: 'student-1' }),
      otherStudentToken: jwt.sign({}, jwtSecret, { subject: 'student-2' }),
      issuerToken: jwt.sign({}, jwtSecret, { subject: 'issuer-1' }),
    }
  })()
}

function credentialUpload(app, token = jwt.sign({}, jwtSecret, { subject: 'student-1' })) {
  return request(app)
    .post('/api/student/certificates')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('%PDF-1.7 fake certificate'), { filename: 'degree.pdf', contentType: 'application/pdf' })
}

test('student can upload, review/edit extracted data, and submit a certificate', async (t) => {
  const { app } = await createTestContext(t)
  const upload = await credentialUpload(app)

  assert.equal(upload.status, 201)
  assert.equal(upload.body.certificate.status, 'DRAFT')
  assert.equal(upload.body.certificate.extractionStatus, 'COMPLETED')
  assert.equal(upload.body.certificate.extractedData.recipientName, 'Jordan Lee')
  assert.equal('storagePath' in upload.body.certificate, false)

  const dashboard = await request(app).get('/api/student/dashboard').set('Authorization', `Bearer ${jwt.sign({}, jwtSecret, { subject: 'student-1' })}`)
  assert.equal(dashboard.status, 200)
  assert.equal(dashboard.body.counts.DRAFT, 1)

  const certificateId = upload.body.certificate.id
  const review = await request(app)
    .patch(`/api/student/certificates/${certificateId}/review`)
    .set('Authorization', `Bearer ${jwt.sign({}, jwtSecret, { subject: 'student-1' })}`)
    .send({ ...extractedCredential, recipientName: 'Jordan A. Lee' })
  assert.equal(review.status, 200)
  assert.equal(review.body.certificate.reviewedData.recipientName, 'Jordan A. Lee')

  const submitted = await request(app)
    .post(`/api/student/certificates/${certificateId}/submit`)
    .set('Authorization', `Bearer ${jwt.sign({}, jwtSecret, { subject: 'student-1' })}`)
  assert.equal(submitted.status, 200)
  assert.equal(submitted.body.certificate.status, 'SUBMITTED')
  assert.ok(submitted.body.certificate.submittedAt)
})

test('student can continue manually when AI extraction is not configured', async (t) => {
  const { app } = await createTestContext(t, {
    aiExtractor: async () => {
      const error = new Error('Missing API key')
      error.code = 'AI_NOT_CONFIGURED'
      throw error
    },
  })
  const response = await credentialUpload(app)

  assert.equal(response.status, 201)
  assert.equal(response.body.certificate.extractionStatus, 'FAILED')
  assert.match(response.body.certificate.extractionMessage, /enter the certificate details manually/)
})

test('certificate review is restricted to its student owner', async (t) => {
  const { app } = await createTestContext(t)
  const upload = await credentialUpload(app)
  const response = await request(app)
    .patch(`/api/student/certificates/${upload.body.certificate.id}/review`)
    .set('Authorization', `Bearer ${jwt.sign({}, jwtSecret, { subject: 'student-2' })}`)
    .send(extractedCredential)

  assert.equal(response.status, 404)
  assert.equal(response.body.error.code, 'CERTIFICATE_NOT_FOUND')
})

test('issuer role cannot use student dashboard or upload endpoints', async (t) => {
  const { app, issuerToken } = await createTestContext(t)
  const response = await request(app).get('/api/student/dashboard').set('Authorization', `Bearer ${issuerToken}`)

  assert.equal(response.status, 403)
  assert.equal(response.body.error.code, 'FORBIDDEN')
})

test('certificate upload rejects unsupported file types', async (t) => {
  const { app, studentToken } = await createTestContext(t)
  const response = await request(app)
    .post('/api/student/certificates')
    .set('Authorization', `Bearer ${studentToken}`)
    .attach('file', Buffer.from('not a certificate'), { filename: 'notes.txt', contentType: 'text/plain' })

  assert.equal(response.status, 415)
  assert.equal(response.body.error.code, 'UNSUPPORTED_FILE_TYPE')
})

test('certificate upload rejects a spoofed file extension and MIME type', async (t) => {
  const { app, studentToken } = await createTestContext(t)
  const response = await request(app)
    .post('/api/student/certificates')
    .set('Authorization', `Bearer ${studentToken}`)
    .attach('file', Buffer.from('not actually a PDF'), { filename: 'fake.pdf', contentType: 'application/pdf' })

  assert.equal(response.status, 415)
  assert.equal(response.body.error.code, 'INVALID_FILE_CONTENT')
})

test('certificate cannot be submitted before details are reviewed', async (t) => {
  const { app } = await createTestContext(t)
  const upload = await credentialUpload(app)
  const response = await request(app)
    .post(`/api/student/certificates/${upload.body.certificate.id}/submit`)
    .set('Authorization', `Bearer ${jwt.sign({}, jwtSecret, { subject: 'student-1' })}`)

  assert.equal(response.status, 422)
  assert.equal(response.body.error.code, 'REVIEW_REQUIRED')
})
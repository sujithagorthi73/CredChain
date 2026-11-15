import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../src/app.js'

const jwtSecret = 'workflow-test-secret-that-is-at-least-thirty-two-characters'
const extractedCredential = {
  recipientName: 'Morgan Chen',
  credentialTitle: 'Secure Systems Engineering',
  issuingInstitution: 'CredChain Test University',
  issuedOn: '2026-06-12',
  expiresOn: null,
  credentialId: 'CCTU-SSE-4102',
  description: 'Professional certificate in secure systems engineering.',
}

function matches(record, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(record[key])
    if (value && typeof value === 'object' && 'path' in value) return record[key]?.[value.path[0]] === value.equals
    return record[key] === value
  })
}

function project(record, select) {
  if (!select) return record
  return Object.fromEntries(Object.entries(select).flatMap(([key, selection]) => {
    if (selection === true && key in record) return [[key, record[key]]]
    if (selection?.select && record[key]) return [[key, project(record[key], selection.select)]]
    return []
  }))
}

test('student-to-issuer-to-public-verifier workflow, including revocation', async (t) => {
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'credchain-workflow-'))
  t.after(() => rm(uploadDir, { recursive: true, force: true }))

  const users = [{
    id: 'issuer-1',
    email: 'issuer@cctu.example',
    fullName: 'CCTU Registrar',
    passwordHash: 'unused',
    role: 'ISSUER',
    institutionName: 'CredChain Test University',
  }]
  const certificates = []
  const onChain = new Map()
  let nextId = 1
  const prisma = {
    user: {
      async create({ data, select }) {
        const user = { id: `student-${nextId++}`, institutionName: null, ...data }
        users.push(user)
        return project(user, select)
      },
      async findUnique({ where, select }) {
        const user = users.find((record) => record.id === where.id || record.email === where.email)
        return user ? project(user, select) : null
      },
    },
    certificate: {
      async create({ data, select }) {
        const certificate = { id: `certificate-${nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...data }
        certificates.push(certificate)
        return project(certificate, select)
      },
      async findMany({ where, select }) {
        return certificates.filter((record) => matches(record, where)).map((record) => project(record, select))
      },
      async findFirst({ where, select }) {
        const record = certificates.find((entry) => matches(entry, where))
        return record ? project(record, select) : null
      },
      async findUnique({ where, select }) {
        const record = certificates.find((entry) => matches(entry, where))
        return record ? project(record, select) : null
      },
      async updateMany({ where, data }) {
        const record = certificates.find((entry) => matches(entry, where))
        if (!record) return { count: 0 }
        Object.assign(record, data, { updatedAt: new Date() })
        return { count: 1 }
      },
    },
  }
  const chainService = {
    async registerCredential(hash) {
      assert.equal(onChain.has(hash), false)
      onChain.set(hash, { exists: true, issuer: '0xCCTUIssuer', issuedAt: 1_780_000_000, revoked: false, verified: true })
      return { transactionHash: '0xworkflow-approval', chainId: 10143 }
    },
    async verifyCredential(hash) {
      return onChain.get(hash) ?? { exists: false, issuer: null, issuedAt: 0, revoked: false, verified: false }
    },
    async revokeCredential(hash) {
      const record = onChain.get(hash)
      assert.ok(record)
      Object.assign(record, { revoked: true, verified: false })
      return { transactionHash: '0xworkflow-revocation', chainId: 10143 }
    },
  }
  const app = createApp({
    prisma,
    jwtSecret,
    uploadDir,
    aiExtractor: async () => extractedCredential,
    chainService,
  })
  const issuerToken = jwt.sign({}, jwtSecret, { subject: 'issuer-1' })

  const registration = await request(app).post('/api/auth/register').send({
    fullName: 'Morgan Chen',
    email: 'morgan@example.com',
    password: 'a-secure-workflow-password',
  })
  assert.equal(registration.status, 201)
  const studentToken = registration.body.token

  const upload = await request(app)
    .post('/api/student/certificates')
    .set('Authorization', `Bearer ${studentToken}`)
    .attach('file', Buffer.from('%PDF-1.7 workflow certificate'), { filename: 'secure-systems.pdf', contentType: 'application/pdf' })
  assert.equal(upload.status, 201)
  const certificateId = upload.body.certificate.id
  const publicId = upload.body.certificate.publicId

  const review = await request(app)
    .patch(`/api/student/certificates/${certificateId}/review`)
    .set('Authorization', `Bearer ${studentToken}`)
    .send(extractedCredential)
  assert.equal(review.status, 200)

  const submission = await request(app)
    .post(`/api/student/certificates/${certificateId}/submit`)
    .set('Authorization', `Bearer ${studentToken}`)
  assert.equal(submission.status, 200)
  assert.equal(submission.body.certificate.status, 'SUBMITTED')

  const queue = await request(app).get('/api/issuer/dashboard').set('Authorization', `Bearer ${issuerToken}`)
  assert.equal(queue.status, 200)
  assert.equal(queue.body.pendingCount, 1)

  const approval = await request(app)
    .post(`/api/issuer/certificates/${certificateId}/approve`)
    .set('Authorization', `Bearer ${issuerToken}`)
  assert.equal(approval.status, 200)
  assert.equal(approval.body.certificate.status, 'APPROVED')

  const verification = await request(app).get(`/api/public/certificates/${publicId}/verify`)
  assert.equal(verification.status, 200)
  assert.equal(verification.body.verified, true)
  assert.equal(verification.body.credential.recipientName, 'Morgan Chen')

  const revocation = await request(app)
    .post(`/api/issuer/certificates/${certificateId}/revoke`)
    .set('Authorization', `Bearer ${issuerToken}`)
  assert.equal(revocation.status, 200)
  assert.equal(revocation.body.certificate.status, 'REVOKED')

  const revokedVerification = await request(app).get(`/api/public/certificates/${publicId}/verify`)
  assert.equal(revokedVerification.status, 200)
  assert.equal(revokedVerification.body.verified, false)
  assert.equal(revokedVerification.body.status, 'REVOKED')
})
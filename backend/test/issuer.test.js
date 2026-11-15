import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { hashCredential } from '../src/services/credential-hash.js'

const jwtSecret = 'issuer-test-secret-that-is-at-least-thirty-two-characters'
const credential = {
  recipientName: 'Jordan Lee',
  credentialTitle: 'Applied Data Science',
  issuingInstitution: 'Northstar Institute',
  issuedOn: '2025-05-18',
  expiresOn: null,
  credentialId: 'NS-DS-2048',
  description: 'Professional certificate in applied data science.',
}

function project(record, select) {
  if (!select) return record
  return Object.fromEntries(Object.entries(select).flatMap(([key, selection]) => {
    if (selection === true && key in record) return [[key, record[key]]]
    if (selection?.select && record[key]) return [[key, project(record[key], selection.select)]]
    return []
  }))
}

function matches(record, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'path' in value) return record[key]?.[value.path[0]] === value.equals
    return record[key] === value
  })
}

function createIssuerContext() {
  const users = [
    { id: 'issuer-1', email: 'issuer@example.com', fullName: 'Issuer One', role: 'ISSUER', institutionName: 'Northstar Institute' },
    { id: 'issuer-2', email: 'issuer2@example.com', fullName: 'Issuer Two', role: 'ISSUER', institutionName: 'Other Institute' },
    { id: 'student-1', email: 'student@example.com', fullName: 'Jordan Lee', role: 'STUDENT', institutionName: null },
  ]
  const certificates = [{
    id: 'certificate-1',
    publicId: 'CC-TEST-12345678',
    studentId: 'student-1',
    issuerUserId: null,
    originalFileName: 'degree.pdf',
    reviewedData: credential,
    status: 'SUBMITTED',
    decisionReason: null,
    submittedAt: new Date('2025-05-19T10:00:00.000Z'),
    approvedAt: null,
    rejectedAt: null,
    revokedAt: null,
    blockchainTxHash: null,
    blockchainHash: null,
    blockchainChainId: null,
    createdAt: new Date('2025-05-19T10:00:00.000Z'),
    updatedAt: new Date('2025-05-19T10:00:00.000Z'),
    student: { id: 'student-1', fullName: 'Jordan Lee' },
  }]
  const chainRecords = new Map()
  const prisma = {
    user: { async findUnique({ where }) { return users.find((user) => user.id === where.id || user.email === where.email) ?? null } },
    certificate: {
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
        Object.assign(record, data)
        return { count: 1 }
      },
    },
  }
  const chainService = {
    async registerCredential(hash) {
      chainRecords.set(hash, { exists: true, issuer: '0xissuer', issuedAt: 1750000000, revoked: false, verified: true })
      return { transactionHash: '0xregistration', chainId: 10143 }
    },
    async revokeCredential(hash) {
      const record = chainRecords.get(hash)
      if (record) Object.assign(record, { revoked: true, verified: false })
      return { transactionHash: '0xrevocation', chainId: 10143 }
    },
    async verifyCredential(hash) {
      return chainRecords.get(hash) ?? { exists: false, issuer: null, issuedAt: 0, revoked: false, verified: false }
    },
  }
  const app = createApp({ prisma, jwtSecret, chainService })
  return {
    app,
    certificates,
    chainRecords,
    issuerToken: jwt.sign({}, jwtSecret, { subject: 'issuer-1' }),
    otherIssuerToken: jwt.sign({}, jwtSecret, { subject: 'issuer-2' }),
    studentToken: jwt.sign({}, jwtSecret, { subject: 'student-1' }),
  }
}

test('issuer queue lists submitted certificates and approval registers the reviewed hash', async () => {
  const { app, certificates, issuerToken, chainRecords } = createIssuerContext()
  const queue = await request(app).get('/api/issuer/dashboard').set('Authorization', `Bearer ${issuerToken}`)
  assert.equal(queue.status, 200)
  assert.equal(queue.body.pendingCount, 1)
  assert.equal(queue.body.certificates[0].student.fullName, 'Jordan Lee')

  const approval = await request(app)
    .post('/api/issuer/certificates/certificate-1/approve')
    .set('Authorization', `Bearer ${issuerToken}`)
  assert.equal(approval.status, 200)
  assert.equal(approval.body.certificate.status, 'APPROVED')
  assert.equal(approval.body.certificate.blockchainHash, hashCredential(credential))
  assert.equal(approval.body.certificate.blockchainTxHash, '0xregistration')
  assert.equal(chainRecords.has(hashCredential(credential)), true)
  assert.equal(certificates[0].issuerUserId, 'issuer-1')
})

test('public verification compares the reviewed data hash with the registry and exposes no student email', async () => {
  const { app, issuerToken } = createIssuerContext()
  await request(app).post('/api/issuer/certificates/certificate-1/approve').set('Authorization', `Bearer ${issuerToken}`)

  const response = await request(app).get('/api/public/certificates/CC-TEST-12345678/verify')

  assert.equal(response.status, 200)
  assert.equal(response.body.verified, true)
  assert.equal(response.body.status, 'VERIFIED')
  assert.equal(response.body.hashMatches, true)
  assert.equal('email' in response.body, false)
  assert.equal(response.body.blockchain.transactionHash, '0xregistration')
})

test('public verification fails when the registry does not confirm the credential hash', async () => {
  const { app, issuerToken, chainRecords } = createIssuerContext()
  await request(app).post('/api/issuer/certificates/certificate-1/approve').set('Authorization', `Bearer ${issuerToken}`)
  chainRecords.get(hashCredential(credential)).verified = false

  const response = await request(app).get('/api/public/certificates/CC-TEST-12345678/verify')

  assert.equal(response.status, 200)
  assert.equal(response.body.verified, false)
  assert.equal(response.body.status, 'UNVERIFIED')
})

test('issuer can reject a submitted certificate with a validated reason', async () => {
  const { app, issuerToken } = createIssuerContext()
  const response = await request(app)
    .post('/api/issuer/certificates/certificate-1/reject')
    .set('Authorization', `Bearer ${issuerToken}`)
    .send({ reason: 'The institution could not confirm this credential.' })

  assert.equal(response.status, 200)
  assert.equal(response.body.certificate.status, 'REJECTED')
  assert.equal(response.body.certificate.decisionReason, 'The institution could not confirm this credential.')
})

test('only the approving issuer can revoke; public verification then reports revoked', async () => {
  const { app, issuerToken, otherIssuerToken } = createIssuerContext()
  await request(app).post('/api/issuer/certificates/certificate-1/approve').set('Authorization', `Bearer ${issuerToken}`)

  const forbidden = await request(app)
    .post('/api/issuer/certificates/certificate-1/revoke')
    .set('Authorization', `Bearer ${otherIssuerToken}`)
  assert.equal(forbidden.status, 409)

  const revocation = await request(app)
    .post('/api/issuer/certificates/certificate-1/revoke')
    .set('Authorization', `Bearer ${issuerToken}`)
  assert.equal(revocation.status, 200)
  assert.equal(revocation.body.certificate.status, 'REVOKED')

  const verification = await request(app).get('/api/public/certificates/CC-TEST-12345678/verify')
  assert.equal(verification.status, 200)
  assert.equal(verification.body.verified, false)
  assert.equal(verification.body.status, 'REVOKED')
})

test('student role cannot access issuer decisions and unapproved credentials are not public', async () => {
  const { app, studentToken } = createIssuerContext()
  const decision = await request(app)
    .post('/api/issuer/certificates/certificate-1/approve')
    .set('Authorization', `Bearer ${studentToken}`)
  const verify = await request(app).get('/api/public/certificates/CC-TEST-12345678/verify')

  assert.equal(decision.status, 403)
  assert.equal(verify.status, 404)
})

test('issuer queue and direct decisions are limited to the issuer institution', async () => {
  const { app, otherIssuerToken } = createIssuerContext()
  const queue = await request(app).get('/api/issuer/dashboard').set('Authorization', `Bearer ${otherIssuerToken}`)
  const decision = await request(app)
    .post('/api/issuer/certificates/certificate-1/approve')
    .set('Authorization', `Bearer ${otherIssuerToken}`)

  assert.equal(queue.status, 200)
  assert.equal(queue.body.pendingCount, 0)
  assert.equal(decision.status, 403)
  assert.equal(decision.body.error.code, 'ISSUER_INSTITUTION_MISMATCH')
})

test('credential hash is stable regardless of object property order', () => {
  assert.equal(hashCredential({ first: 1, second: 2 }), hashCredential({ second: 2, first: 1 }))
})
import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { hashCredential } from '../services/credential-hash.js'
import { credentialDataSchema } from '../services/ai-extractor.js'

const certificateSelect = {
  id: true,
  publicId: true,
  studentId: true,
  issuerUserId: true,
  originalFileName: true,
  reviewedData: true,
  status: true,
  decisionReason: true,
  submittedAt: true,
  approvedAt: true,
  rejectedAt: true,
  revokedAt: true,
  blockchainTxHash: true,
  blockchainHash: true,
  blockchainChainId: true,
  createdAt: true,
  updatedAt: true,
}

const rejectSchema = z.object({ reason: z.string().trim().min(5).max(500) })

function chainUnavailable(chainService) {
  if (!chainService) throw new AppError(503, 'CHAIN_NOT_CONFIGURED', 'Monad registry configuration is incomplete.')
  return chainService
}

function issuerInstitutionWhere(user) {
  return user.role === 'ADMIN'
    ? {}
    : { reviewedData: { path: ['issuingInstitution'], equals: user.institutionName || '' } }
}

function requireMatchingInstitution(user, credential) {
  if (user.role === 'ADMIN') return
  const issuerInstitution = user.institutionName?.trim().toLocaleLowerCase()
  const certificateInstitution = credential.issuingInstitution.trim().toLocaleLowerCase()
  if (!issuerInstitution || issuerInstitution !== certificateInstitution) {
    throw new AppError(403, 'ISSUER_INSTITUTION_MISMATCH', 'This credential was issued by a different institution.')
  }
}

export function createIssuerRouter({ prisma, jwtSecret, chainService }) {
  const router = Router()
  const { requireAuth, requireRole } = createAuthMiddleware({ prisma, jwtSecret })
  const requireIssuer = [requireAuth, requireRole('ISSUER', 'ADMIN')]

  router.get('/dashboard', ...requireIssuer, async (request, response) => {
    const certificates = await prisma.certificate.findMany({
      where: { status: 'SUBMITTED', ...issuerInstitutionWhere(request.user) },
      orderBy: { submittedAt: 'asc' },
      select: { ...certificateSelect, student: { select: { id: true, fullName: true } } },
    })
    const issuedCertificates = await prisma.certificate.findMany({
      where: { issuerUserId: request.user.id, status: { in: ['APPROVED', 'REVOKED'] } },
      orderBy: { approvedAt: 'desc' },
      select: { ...certificateSelect, student: { select: { id: true, fullName: true } } },
    })
    response.json({ pendingCount: certificates.length, certificates, issuedCertificates })
  })

  router.post('/certificates/:id/approve', ...requireIssuer, async (request, response) => {
    const certificate = await prisma.certificate.findFirst({
      where: { id: request.params.id },
      select: certificateSelect,
    })
    if (!certificate) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found.')
    if (certificate.status !== 'SUBMITTED') throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'Only submitted certificates can be approved.')

    const parsed = credentialDataSchema.safeParse(certificate.reviewedData)
    if (!parsed.success) throw new AppError(422, 'INVALID_CERTIFICATE_DATA', 'The reviewed credential data is invalid.')
    requireMatchingInstitution(request.user, parsed.data)
    const credentialHash = hashCredential(parsed.data)
    const chain = chainUnavailable(chainService)
    const reservation = await prisma.certificate.updateMany({
      where: { id: certificate.id, status: 'SUBMITTED' },
      data: { status: 'APPROVING', issuerUserId: request.user.id },
    })
    if (!reservation.count) throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'Certificate changed while approval was being started.')

    let transaction
    try {
      transaction = await chain.registerCredential(credentialHash)
    } catch (error) {
      await prisma.certificate.updateMany({
        where: { id: certificate.id, status: 'APPROVING', issuerUserId: request.user.id },
        data: { status: 'SUBMITTED', issuerUserId: null },
      })
      throw error
    }
    const updated = await prisma.certificate.updateMany({
      where: { id: certificate.id, status: 'APPROVING', issuerUserId: request.user.id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        blockchainTxHash: transaction.transactionHash,
        blockchainHash: credentialHash,
        blockchainChainId: transaction.chainId,
      },
    })
    if (!updated.count) throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'Certificate changed while approval was being recorded.')

    const approved = await prisma.certificate.findFirst({ where: { id: certificate.id }, select: certificateSelect })
    response.json({ certificate: approved })
  })

  router.post('/certificates/:id/reject', ...requireIssuer, async (request, response) => {
    const { reason } = rejectSchema.parse(request.body)
    const certificate = await prisma.certificate.findFirst({ where: { id: request.params.id }, select: certificateSelect })
    if (!certificate) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found.')
    if (certificate.status !== 'SUBMITTED') throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'Only submitted certificates can be rejected.')
    const parsed = credentialDataSchema.safeParse(certificate.reviewedData)
    if (!parsed.success) throw new AppError(422, 'INVALID_CERTIFICATE_DATA', 'The reviewed credential data is invalid.')
    requireMatchingInstitution(request.user, parsed.data)

    const updated = await prisma.certificate.updateMany({
      where: { id: certificate.id, status: 'SUBMITTED' },
      data: { status: 'REJECTED', issuerUserId: request.user.id, decisionReason: reason, rejectedAt: new Date() },
    })
    if (!updated.count) throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'Certificate changed while the decision was being recorded.')
    const rejected = await prisma.certificate.findFirst({ where: { id: certificate.id }, select: certificateSelect })
    response.json({ certificate: rejected })
  })

  router.post('/certificates/:id/revoke', ...requireIssuer, async (request, response) => {
    const certificate = await prisma.certificate.findFirst({ where: { id: request.params.id }, select: certificateSelect })
    if (!certificate) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found.')
    if (certificate.status !== 'APPROVED' || certificate.issuerUserId !== request.user.id) {
      throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'Only the approving issuer can revoke an approved credential.')
    }
    if (!certificate.blockchainHash) throw new AppError(409, 'MISSING_BLOCKCHAIN_HASH', 'This certificate has no registered blockchain credential.')

    const transaction = await chainUnavailable(chainService).revokeCredential(certificate.blockchainHash)
    const updated = await prisma.certificate.updateMany({
      where: { id: certificate.id, issuerUserId: request.user.id, status: 'APPROVED' },
      data: { status: 'REVOKED', revokedAt: new Date(), blockchainTxHash: transaction.transactionHash },
    })
    if (!updated.count) throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'Certificate changed while revocation was being recorded.')
    const revoked = await prisma.certificate.findFirst({ where: { id: certificate.id }, select: certificateSelect })
    response.json({ certificate: revoked })
  })

  return router
}
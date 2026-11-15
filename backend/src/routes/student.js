import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { credentialDataSchema } from '../services/ai-extractor.js'

const unlinkAsync = promisify(unlink)
const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const certificateSelect = {
  id: true,
  publicId: true,
  originalFileName: true,
  mimeType: true,
  extractedData: true,
  reviewedData: true,
  extractionStatus: true,
  extractionMessage: true,
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

function createUpload(uploadDir, maxUploadMb) {
  return multer({
    storage: multer.diskStorage({
      destination: (request, file, callback) => mkdir(uploadDir, { recursive: true }, (error) => callback(error, uploadDir)),
      filename: (request, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: maxUploadMb * 1024 * 1024, files: 1 },
    fileFilter: (request, file, callback) => {
      if (!allowedMimeTypes.has(file.mimetype)) {
        return callback(new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Upload a PDF, PNG, JPEG, or WebP certificate.'))
      }
      callback(null, true)
    },
  })
}

function makePublicId() {
  return `CC-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`
}

async function hasValidFileSignature(file) {
  const bytes = await readFile(file.path)
  if (file.mimetype === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (file.mimetype === 'image/webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}

function ownedCertificateQuery(id, studentId) {
  return { id, studentId }
}

export function createStudentRouter({ prisma, jwtSecret, uploadDir = path.resolve('uploads'), maxUploadMb = 10, aiExtractor }) {
  const router = Router()
  const { requireAuth, requireRole } = createAuthMiddleware({ prisma, jwtSecret })
  const upload = createUpload(uploadDir, maxUploadMb)
  const requireStudent = [requireAuth, requireRole('STUDENT')]

  router.get('/dashboard', ...requireStudent, async (request, response) => {
    const certificates = await prisma.certificate.findMany({
      where: { studentId: request.user.id },
      orderBy: { createdAt: 'desc' },
      select: certificateSelect,
    })
    const counts = certificates.reduce((result, certificate) => {
      result[certificate.status] = (result[certificate.status] || 0) + 1
      return result
    }, {})
    response.json({ counts, certificates })
  })

  router.post('/certificates', ...requireStudent, upload.single('file'), async (request, response) => {
    if (!request.file) throw new AppError(400, 'FILE_REQUIRED', 'Choose a certificate file to upload.')
    if (!(await hasValidFileSignature(request.file))) {
      await unlinkAsync(request.file.path).catch(() => {})
      throw new AppError(415, 'INVALID_FILE_CONTENT', 'The uploaded file content does not match its declared type.')
    }

    let extractedData
    let extractionStatus = 'COMPLETED'
    let extractionMessage = null
    try {
      extractedData = await aiExtractor(request.file)
      extractedData = credentialDataSchema.parse(extractedData)
    } catch (error) {
      extractionStatus = 'FAILED'
      extractionMessage = error.code === 'AI_NOT_CONFIGURED'
        ? 'AI extraction is not configured; enter the certificate details manually.'
        : 'AI extraction failed; enter the certificate details manually.'
    }

    try {
      const certificate = await prisma.certificate.create({
        data: {
          publicId: makePublicId(),
          studentId: request.user.id,
          originalFileName: path.basename(request.file.originalname).slice(0, 255),
          storagePath: request.file.path,
          mimeType: request.file.mimetype,
          ...(extractedData ? { extractedData } : {}),
          extractionStatus,
          extractionMessage,
          status: 'DRAFT',
        },
        select: certificateSelect,
      })
      response.status(201).json({ certificate })
    } catch (error) {
      await unlinkAsync(request.file.path).catch(() => {})
      throw error
    }
  })

  router.patch('/certificates/:id/review', ...requireStudent, async (request, response) => {
    const reviewedData = credentialDataSchema.parse(request.body)
    const current = await prisma.certificate.findFirst({ where: ownedCertificateQuery(request.params.id, request.user.id) })
    if (!current) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found.')
    if (current.status !== 'DRAFT') throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'Only draft certificates can be edited.')

    const update = await prisma.certificate.updateMany({
      where: { ...ownedCertificateQuery(request.params.id, request.user.id), status: 'DRAFT' },
      data: { reviewedData },
    })
    if (!update.count) throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'This certificate changed and can no longer be edited.')
    const certificate = await prisma.certificate.findFirst({ where: ownedCertificateQuery(request.params.id, request.user.id), select: certificateSelect })
    response.json({ certificate })
  })

  router.post('/certificates/:id/submit', ...requireStudent, async (request, response) => {
    const current = await prisma.certificate.findFirst({ where: ownedCertificateQuery(request.params.id, request.user.id) })
    if (!current) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found.')
    if (current.status !== 'DRAFT') throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'Only draft certificates can be submitted.')
    const reviewedData = credentialDataSchema.safeParse(current.reviewedData)
    if (!reviewedData.success) throw new AppError(422, 'REVIEW_REQUIRED', 'Review and save valid certificate details before submitting.')

    const update = await prisma.certificate.updateMany({
      where: { ...ownedCertificateQuery(request.params.id, request.user.id), status: 'DRAFT' },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    })
    if (!update.count) throw new AppError(409, 'INVALID_CERTIFICATE_STATE', 'This certificate changed and can no longer be submitted.')
    const certificate = await prisma.certificate.findFirst({ where: ownedCertificateQuery(request.params.id, request.user.id), select: certificateSelect })
    response.json({ certificate })
  })

  return router
}
import { Router } from 'express'
import { AppError } from '../lib/errors.js'
import { hashCredential } from '../services/credential-hash.js'
import { credentialDataSchema } from '../services/ai-extractor.js'

export function createPublicRouter({ prisma, chainService }) {
  const router = Router()

  router.get('/certificates/:publicId/verify', async (request, response) => {
    const certificate = await prisma.certificate.findUnique({
      where: { publicId: request.params.publicId },
      select: {
        publicId: true,
        reviewedData: true,
        status: true,
        blockchainHash: true,
        blockchainTxHash: true,
        blockchainChainId: true,
      },
    })
    if (!certificate || !['APPROVED', 'REVOKED'].includes(certificate.status)) {
      throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Verified certificate not found.')
    }
    if (!chainService) throw new AppError(503, 'CHAIN_NOT_CONFIGURED', 'Monad registry configuration is incomplete.')

    const parsed = credentialDataSchema.safeParse(certificate.reviewedData)
    const expectedHash = parsed.success ? hashCredential(parsed.data) : null
    const hashMatches = Boolean(expectedHash && certificate.blockchainHash === expectedHash)
    const chainRecord = hashMatches ? await chainService.verifyCredential(expectedHash) : null
    const verified = hashMatches && chainRecord.exists && chainRecord.verified && !chainRecord.revoked && certificate.status === 'APPROVED'

    response.json({
      publicId: certificate.publicId,
      verified,
      status: certificate.status === 'REVOKED' || chainRecord?.revoked ? 'REVOKED' : verified ? 'VERIFIED' : 'UNVERIFIED',
      hashMatches,
      credential: parsed.success ? parsed.data : null,
      blockchain: {
        chainId: certificate.blockchainChainId,
        transactionHash: certificate.blockchainTxHash,
        issuer: chainRecord?.issuer ?? null,
        issuedAt: chainRecord?.issuedAt ?? null,
      },
    })
  })

  return router
}
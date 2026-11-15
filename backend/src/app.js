import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { errorHandler, notFoundHandler } from './lib/errors.js'
import { createAuthRouter } from './routes/auth.js'
import { createIssuerRouter } from './routes/issuer.js'
import { createPublicRouter } from './routes/public.js'
import { createStudentRouter } from './routes/student.js'

export function createApp({ prisma, jwtSecret, jwtExpiresIn, frontendOrigin = 'http://localhost:5173', uploadDir, maxUploadMb, aiExtractor, chainService } = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: frontendOrigin.split(',').map((origin) => origin.trim()), credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }))

  if (prisma && jwtSecret) {
    app.use('/api/auth', createAuthRouter({ prisma, jwtSecret, jwtExpiresIn }))
    app.use('/api/student', createStudentRouter({ prisma, jwtSecret, uploadDir, maxUploadMb, aiExtractor }))
    app.use('/api/issuer', createIssuerRouter({ prisma, jwtSecret, chainService }))
    app.use('/api/public', createPublicRouter({ prisma, chainService }))
  }

  app.get('/api/health', (request, response) => {
    response.json({ status: 'ok', service: 'credchain-api' })
  })

  app.get('/api/health/ready', async (request, response) => {
    if (!prisma) return response.status(503).json({ status: 'not_ready', database: 'unconfigured' })
    try {
      await prisma.$queryRaw`SELECT 1`
      response.json({ status: 'ready', database: 'connected' })
    } catch {
      response.status(503).json({ status: 'not_ready', database: 'unavailable' })
    }
  })

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createApp } from './app.js'
import { createAiExtractor } from './services/ai-extractor.js'
import { createMonadRegistry } from './services/monad-registry.js'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy backend/.env.example to backend/.env and configure PostgreSQL.')
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.')
}

const prisma = new PrismaClient()
const app = createApp({
  prisma,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  frontendOrigin: process.env.FRONTEND_ORIGIN,
  uploadDir: process.env.UPLOAD_DIR,
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  aiExtractor: createAiExtractor(),
  chainService: createMonadRegistry(),
})
const port = Number(process.env.PORT || 4000)
const server = app.listen(port, () => console.info(`CredChain API listening on port ${port}`))

async function shutdown(signal) {
  console.info(`${signal} received; shutting down CredChain API`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
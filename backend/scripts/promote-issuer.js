import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const [rawEmail, ...institutionParts] = process.argv.slice(2)
const email = rawEmail?.trim().toLowerCase()
const institutionName = institutionParts.join(' ').trim()

if (!email || !institutionName) {
  console.error('Usage: npm run issuer:promote -- <student-email> <institution-name>')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
 const result = await prisma.user.updateMany({
  where: { email, role: { in: ['STUDENT', 'ISSUER'] } },
  data: { role: 'ISSUER', institutionName },
})
  if (!result.count) {
    console.error('No student account found for that email. Register the account first.')
    process.exitCode = 1
  } else {
    console.info(`Promoted ${email} to issuer for ${institutionName}.`)
  }
} finally {
  await prisma.$disconnect()
}
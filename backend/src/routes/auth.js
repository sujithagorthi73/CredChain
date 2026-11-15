import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import { createAuthMiddleware } from '../middleware/auth.js'

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
})

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
})

const publicUserSelect = { id: true, email: true, fullName: true, role: true, institutionName: true }

function issueToken(user, jwtSecret, jwtExpiresIn) {
  return jwt.sign({}, jwtSecret, { subject: user.id, expiresIn: jwtExpiresIn })
}

export function createAuthRouter({ prisma, jwtSecret, jwtExpiresIn = '8h' }) {
  const router = Router()
  const { requireAuth } = createAuthMiddleware({ prisma, jwtSecret })

  router.post('/register', async (request, response) => {
    const input = registerSchema.parse(request.body)
    const passwordHash = await bcrypt.hash(input.password, 12)
    const user = await prisma.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        role: 'STUDENT',
      },
      select: publicUserSelect,
    })

    response.status(201).json({
      token: issueToken(user, jwtSecret, jwtExpiresIn),
      user,
    })
  })

  router.post('/login', async (request, response) => {
    const input = loginSchema.parse(request.body)
    const user = await prisma.user.findUnique({ where: { email: input.email } })
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
    }

    const { passwordHash, ...publicUser } = user
    response.json({ token: issueToken(user, jwtSecret, jwtExpiresIn), user: publicUser })
  })

  router.get('/me', requireAuth, (request, response) => {
    response.json({ user: request.user })
  })

  return router
}
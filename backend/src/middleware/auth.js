import jwt from 'jsonwebtoken'
import { AppError } from '../lib/errors.js'

export function createAuthMiddleware({ prisma, jwtSecret }) {
  async function requireAuth(request, response, next) {
    const authorization = request.get('authorization')
    const [scheme, token] = authorization?.split(' ') ?? []
    if (scheme !== 'Bearer' || !token) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.'))
    }

    let claims
    try {
      claims = jwt.verify(token, jwtSecret)
    } catch {
      return next(new AppError(401, 'INVALID_TOKEN', 'Your session is invalid or expired.'))
    }

    if (typeof claims !== 'object' || typeof claims.sub !== 'string') {
      return next(new AppError(401, 'INVALID_TOKEN', 'Your session is invalid or expired.'))
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: claims.sub },
        select: { id: true, email: true, fullName: true, role: true, institutionName: true },
      })
      if (!user) return next(new AppError(401, 'INVALID_TOKEN', 'Your session is invalid or expired.'))
      request.user = user
      return next()
    } catch (error) {
      return next(error)
    }
  }

  function requireRole(...roles) {
    return (request, response, next) => {
      if (!request.user || !roles.includes(request.user.role)) {
        return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'))
      }
      next()
    }
  }

  return { requireAuth, requireRole }
}
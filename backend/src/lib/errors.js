export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export function notFoundHandler(request, response, next) {
  next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found.'))
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error)

  let statusCode = error.statusCode ?? error.status ?? 500
  let code = error.code ?? 'INTERNAL_ERROR'
  let message = error.message
  let details = error.details

  if (error.name === 'ZodError') {
    statusCode = 400
    code = 'VALIDATION_ERROR'
    message = 'The request contains invalid data.'
    details = error.issues.map(({ path, message: issueMessage }) => ({ path, message: issueMessage }))
  } else if (code === 'P2002') {
    statusCode = 409
    code = 'CONFLICT'
    message = 'A record with these details already exists.'
  } else if (code === 'P2025') {
    statusCode = 404
    code = 'NOT_FOUND'
    message = 'The requested resource was not found.'
  } else if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    statusCode = 400
    code = 'INVALID_JSON'
    message = 'The request body must contain valid JSON.'
  }

  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) statusCode = 500
  if (statusCode >= 500) {
    code = 'INTERNAL_ERROR'
    message = 'An unexpected error occurred.'
    console.error(error)
    details = undefined
  }

  response.status(statusCode).json({
    error: {
      code,
      message: message || 'The request could not be completed.',
      ...(details ? { details } : {}),
    },
  })
}
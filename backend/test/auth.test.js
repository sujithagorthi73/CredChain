import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'

const jwtSecret = 'test-secret-that-is-at-least-thirty-two-characters-long'

function createTestContext() {
  const users = new Map()
  let nextId = 1
  const project = (user, select) => select
    ? Object.fromEntries(Object.keys(select).filter((key) => select[key] && key in user).map((key) => [key, user[key]]))
    : user
  const prisma = {
    user: {
      async create({ data, select }) {
        if ([...users.values()].some((user) => user.email === data.email)) {
          const error = new Error('Unique constraint')
          error.code = 'P2002'
          throw error
        }
        const user = { id: `user-${nextId++}`, institutionName: null, ...data }
        users.set(user.id, user)
        return project(user, select)
      },
      async findUnique({ where, select }) {
        const user = where.id ? users.get(where.id) ?? null : [...users.values()].find((entry) => entry.email === where.email) ?? null
        return user ? project(user, select) : null
      },
    },
  }
  return { app: createApp({ prisma, jwtSecret }), users }
}

test('students can register with normalized email and receive a bearer token', async () => {
  const { app, users } = createTestContext()
  const response = await request(app).post('/api/auth/register').send({
    fullName: 'Avery Student',
    email: '  AVERY@example.com ',
    password: 'a-long-student-password',
  })

  assert.equal(response.status, 201)
  assert.equal(response.body.user.email, 'avery@example.com')
  assert.equal(response.body.user.role, 'STUDENT')
  assert.equal('passwordHash' in response.body.user, false)
  assert.equal(users.get(response.body.user.id).passwordHash.startsWith('$2'), true)
  assert.equal(typeof response.body.token, 'string')
})

test('registration rejects weak passwords and does not create a user', async () => {
  const { app, users } = createTestContext()
  const response = await request(app).post('/api/auth/register').send({
    fullName: 'Avery Student',
    email: 'avery@example.com',
    password: 'short',
  })

  assert.equal(response.status, 400)
  assert.equal(response.body.error.code, 'VALIDATION_ERROR')
  assert.equal(users.size, 0)
})

test('login is generic for unknown email and wrong password', async () => {
  const { app } = createTestContext()
  const response = await request(app).post('/api/auth/login').send({ email: 'missing@example.com', password: 'wrong-password' })

  assert.equal(response.status, 401)
  assert.deepEqual(response.body.error, { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
})

test('authenticated current-user endpoint reloads identity and role from storage', async () => {
  const { app } = createTestContext()
  const registration = await request(app).post('/api/auth/register').send({
    fullName: 'Avery Student',
    email: 'avery@example.com',
    password: 'a-long-student-password',
  })

  const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${registration.body.token}`)

  assert.equal(response.status, 200)
  assert.equal(response.body.user.email, 'avery@example.com')
  assert.equal(response.body.user.role, 'STUDENT')
})

test('protected current-user endpoint rejects missing and invalid tokens', async () => {
  const { app } = createTestContext()
  const missing = await request(app).get('/api/auth/me')
  const invalid = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid')

  assert.equal(missing.status, 401)
  assert.equal(missing.body.error.code, 'AUTH_REQUIRED')
  assert.equal(invalid.status, 401)
  assert.equal(invalid.body.error.code, 'INVALID_TOKEN')
})
import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'

test('liveness endpoint returns the API identity without touching the database', async () => {
  const response = await request(createApp()).get('/api/health')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { status: 'ok', service: 'credchain-api' })
})

test('readiness endpoint reports missing database configuration', async () => {
  const response = await request(createApp()).get('/api/health/ready')

  assert.equal(response.status, 503)
  assert.deepEqual(response.body, { status: 'not_ready', database: 'unconfigured' })
})

test('readiness endpoint checks the injected database client', async () => {
  const prisma = { $queryRaw: async () => [{ '?column?': 1 }] }
  const response = await request(createApp({ prisma })).get('/api/health/ready')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { status: 'ready', database: 'connected' })
})

test('readiness endpoint reports an unavailable database without leaking details', async () => {
  const prisma = { $queryRaw: async () => { throw new Error('database credentials should not be returned') } }
  const response = await request(createApp({ prisma })).get('/api/health/ready')

  assert.equal(response.status, 503)
  assert.deepEqual(response.body, { status: 'not_ready', database: 'unavailable' })
})

test('unknown API routes use the standard error envelope', async () => {
  const response = await request(createApp()).get('/api/missing')

  assert.equal(response.status, 404)
  assert.equal(response.body.error.code, 'NOT_FOUND')
})
import assert from 'node:assert/strict'
import test from 'node:test'
import { createMonadRegistry } from '../src/services/monad-registry.js'

test('Monad adapter submits and confirms registration/revocation transactions', async () => {
  const calls = []
  const contract = {
    async registerCredential(hash) { calls.push(['register', hash]); return { hash: '0xregister', wait: async () => ({ status: 1 }) } },
    async revokeCredential(hash) { calls.push(['revoke', hash]); return { hash: '0xrevoke', wait: async () => ({ status: 1 }) } },
    async getCredential() { return { issuer: '0x1234000000000000000000000000000000005678', issuedAt: 1_750_000_000n, revoked: false } },
    async verifyCredential() { return true },
  }
  const registry = createMonadRegistry({ contract, chainId: 10143 })

  assert.deepEqual(await registry.registerCredential('0xhash'), { transactionHash: '0xregister', chainId: 10143 })
  assert.deepEqual(await registry.revokeCredential('0xhash'), { transactionHash: '0xrevoke', chainId: 10143 })
  assert.equal((await registry.verifyCredential('0xhash')).verified, true)
  assert.deepEqual(calls, [['register', '0xhash'], ['revoke', '0xhash']])
})

test('Monad adapter refuses to write without RPC, key, and registry address', async () => {
  const registry = createMonadRegistry({ rpcUrl: '', privateKey: '', registryAddress: '' })

  await assert.rejects(registry.registerCredential('0xhash'), { statusCode: 503, code: 'CHAIN_NOT_CONFIGURED' })
})

test('Monad adapter rejects failed transaction receipts', async () => {
  const contract = {
    async registerCredential() { return { hash: '0xfailed', wait: async () => ({ status: 0 }) } },
  }
  const registry = createMonadRegistry({ contract })

  await assert.rejects(registry.registerCredential('0xhash'), { statusCode: 502, code: 'CHAIN_TRANSACTION_FAILED' })
})
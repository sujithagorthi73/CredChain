const { expect } = require('chai')

async function expectCustomError(transactionPromise, errorName) {
  let failure
  try {
    await transactionPromise
  } catch (error) {
    failure = error
  }
  expect(failure, `expected ${errorName} revert`).to.exist
  expect(failure.message).to.include(errorName)
}

describe('CredChainRegistry', function () {
  async function deployRegistry() {
    const [owner, issuer, stranger] = await ethers.getSigners()
    const registry = await ethers.deployContract('CredChainRegistry')
    await registry.waitForDeployment()
    return { registry, owner, issuer, stranger }
  }

  it('registers a credential hash and exposes its immutable issuance record', async function () {
    const { registry, owner } = await deployRegistry()
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes('credential-record'))
    const transaction = await registry.registerCredential(credentialHash)
    const receipt = await transaction.wait()
    const [issuerAddress, issuedAt, revoked] = await registry.getCredential(credentialHash)

    expect(issuerAddress).to.equal(owner.address)
    expect(issuedAt).to.be.greaterThan(0)
    expect(revoked).to.equal(false)
    expect(await registry.verifyCredential(credentialHash)).to.equal(true)
    expect(receipt.logs.length).to.equal(1)
  })

  it('requires owner authorization before an issuer can register', async function () {
    const { registry, issuer, stranger } = await deployRegistry()
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes('issuer-record'))

    await expectCustomError(registry.connect(issuer).registerCredential(credentialHash), 'Unauthorized')
    await registry.setIssuer(issuer.address, true)
    await registry.connect(issuer).registerCredential(credentialHash)
    await expectCustomError(registry.connect(stranger).revokeCredential(credentialHash), 'Unauthorized')
  })

  it('allows only the issuing address to revoke and makes revoked credentials unverifiable', async function () {
    const { registry, owner, issuer } = await deployRegistry()
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes('revoked-record'))
    await registry.registerCredential(credentialHash)

    await expectCustomError(registry.connect(issuer).revokeCredential(credentialHash), 'Unauthorized')
    await registry.revokeCredential(credentialHash)

    const [issuerAddress, , revoked] = await registry.getCredential(credentialHash)
    expect(issuerAddress).to.equal(owner.address)
    expect(revoked).to.equal(true)
    expect(await registry.verifyCredential(credentialHash)).to.equal(false)
  })

  it('rejects duplicate and empty credential hashes', async function () {
    const { registry } = await deployRegistry()
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes('duplicate-record'))
    await expectCustomError(registry.registerCredential(ethers.ZeroHash), 'InvalidCredentialHash')
    await registry.registerCredential(credentialHash)
    await expectCustomError(registry.registerCredential(credentialHash), 'CredentialAlreadyExists')
  })
})
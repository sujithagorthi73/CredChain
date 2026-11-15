import { Contract, JsonRpcProvider, Wallet, ZeroAddress } from 'ethers'
import { AppError } from '../lib/errors.js'

const registryAbi = [
  'function registerCredential(bytes32 credentialHash)',
  'function revokeCredential(bytes32 credentialHash)',
  'function getCredential(bytes32 credentialHash) view returns (address issuer, uint64 issuedAt, bool revoked)',
  'function verifyCredential(bytes32 credentialHash) view returns (bool)',
]

export function createMonadRegistry({
  rpcUrl = process.env.MONAD_RPC_URL,
  privateKey = process.env.MONAD_PRIVATE_KEY,
  registryAddress = process.env.MONAD_REGISTRY_ADDRESS,
  chainId = Number(process.env.MONAD_CHAIN_ID || 10143),
  contract: injectedContract,
} = {}) {
  let contract = injectedContract

  function getContract() {
    if (contract) return contract
    if (!rpcUrl || !privateKey || !registryAddress) {
      throw new AppError(503, 'CHAIN_NOT_CONFIGURED', 'Monad registry configuration is incomplete.')
    }
    const provider = new JsonRpcProvider(rpcUrl, chainId)
    contract = new Contract(registryAddress, registryAbi, new Wallet(privateKey, provider))
    return contract
  }

  async function registerCredential(credentialHash) {
    const transaction = await getContract().registerCredential(credentialHash)
    const receipt = await transaction.wait()
    if (!receipt || receipt.status !== 1) throw new AppError(502, 'CHAIN_TRANSACTION_FAILED', 'Credential registration did not confirm.')
    return { transactionHash: transaction.hash, chainId }
  }

  async function revokeCredential(credentialHash) {
    const transaction = await getContract().revokeCredential(credentialHash)
    const receipt = await transaction.wait()
    if (!receipt || receipt.status !== 1) throw new AppError(502, 'CHAIN_TRANSACTION_FAILED', 'Credential revocation did not confirm.')
    return { transactionHash: transaction.hash, chainId }
  }

  async function verifyCredential(credentialHash) {
    const activeContract = getContract()
    const [issuer, issuedAt, revoked, verified] = await Promise.all([
      activeContract.getCredential(credentialHash),
      activeContract.verifyCredential(credentialHash),
    ]).then(([record, isVerified]) => [record.issuer, record.issuedAt, record.revoked, isVerified])

    return {
      exists: issuer.toLowerCase() !== ZeroAddress.toLowerCase(),
      issuer,
      issuedAt: Number(issuedAt),
      revoked,
      verified,
      chainId,
    }
  }

  return { registerCredential, revokeCredential, verifyCredential }
}
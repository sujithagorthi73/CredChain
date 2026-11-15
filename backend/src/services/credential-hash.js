import { keccak256, toUtf8Bytes } from 'ethers'

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export function hashCredential(credentialData) {
  return keccak256(toUtf8Bytes(stableStringify(credentialData)))
}
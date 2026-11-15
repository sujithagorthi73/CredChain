require('dotenv').config({ path: '../backend/.env' });
process.env.HARDHAT_DISABLE_TELEMETRY_PROMPT = 'true';
process.env.HARDHAT_DISABLE_TELEMETRY_PROMPT = 'true'
require('@nomicfoundation/hardhat-ethers')

module.exports = {
  solidity: '0.8.24',
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  networks: {
    monadTestnet: {
      url: process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
      chainId: Number(process.env.MONAD_CHAIN_ID || 10143),
      accounts: process.env.MONAD_PRIVATE_KEY ? [process.env.MONAD_PRIVATE_KEY] : [],
    },
  },
}
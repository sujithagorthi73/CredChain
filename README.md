# CredChain

CredChain is an AI-assisted certificate workflow with a React/Vite frontend, Express/Prisma API, PostgreSQL storage, and a Solidity credential registry designed for Monad.

- Frontend: see [frontend/README.md](frontend/README.md); run `npm install` and `npm run dev` from `frontend/`.
- Backend: see [backend/README.md](backend/README.md) for PostgreSQL, migration, issuer promotion, and API setup.
- Blockchain: run `npm install` and `npm test` from `blockchain/`; deployment requires Monad testnet configuration.
- Current implementation and verification limits: [PROGRESS.md](PROGRESS.md).

The original public landing page remains at `/`. Real authentication and certificate flows require the backend and PostgreSQL to be running.
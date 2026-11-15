# CredChain API

Express 5 API, Prisma/PostgreSQL persistence, JWT student sessions, private certificate uploads, OpenAI extraction, and issuer/public credential workflows.

## Local Setup

1. From the workspace root, start PostgreSQL with `docker compose up -d postgres` (or use another PostgreSQL 14+ instance).
2. Copy `backend/.env.example` to `backend/.env`. Keep production secrets out of source control. Set `JWT_SECRET` to a random value of at least 32 characters.
3. From `backend/`, run `npm install`, `npm run db:generate`, `npm run db:migrate`, and `npm run dev`.
4. The API listens on `http://localhost:4000`; the frontend Vite server proxies `/api` to it.

New registrations are always students. To authorize an institution operator, first create a student account, then run `npm run issuer:promote -- registrar@example.edu "Example University"` from `backend/`. This command requires direct database access and is deliberately not exposed as a public API.

## Workflow

- Students register/sign in, upload PDF or common image formats, review AI-extracted fields, correct them, and submit.
- AI extraction uses OpenAI Responses. Without `OPENAI_API_KEY`, uploads remain drafts for manual entry.
- Issuers review submissions. Approval hashes canonical reviewed data and registers that hash on the configured registry before marking the database record approved.
- Public verification recalculates the hash and compares it with the Monad registry. Revocation is submitted to the registry and becomes visible publicly.
- Uploaded certificate files remain in the configured private upload directory and are not exposed as static files.

## Tests

Run `npm test -- --test-reporter=spec`. Tests use Prisma-compatible in-memory doubles and a mocked chain/AI boundary; they do not replace live database, OpenAI, or Monad checks.

## Monad Testnet

Deploy the registry from `blockchain/` with `MONAD_RPC_URL`, `MONAD_CHAIN_ID=10143`, and `MONAD_PRIVATE_KEY` set. The deployer is authorized by the contract constructor. Set the resulting address as `MONAD_REGISTRY_ADDRESS` in `backend/.env`; use the same authorized signer for backend writes. Never commit a private key.
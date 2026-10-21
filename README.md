# Chat Backend Assessment — Phase 1

Initial backend foundation only. This phase includes Express/TypeScript setup, validated configuration, Prisma/PostgreSQL, optional Firebase Admin initialization, request logging, centralized errors, and a database-aware health endpoint. No chat APIs are implemented.

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL 14 or newer
- A Firebase service account only if Firebase Admin is needed now

## Setup

Run these commands from the project directory:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` and set `DATABASE_URL` to your local PostgreSQL database. Example format:

`postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public`

The sample `.env` values are placeholders. Create the database before applying the schema. Firebase variables are optional; leave all three blank to skip Firebase initialization, or set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` together. Never commit real credentials. For a private key, preserve escaped `\\n` sequences in the environment value.

## Database and run

```powershell
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

The API listens on `http://localhost:3000` by default. Set `PORT` in `.env` to change it. Check `GET http://localhost:3000/api/health`; it reports HTTP 200 when PostgreSQL is reachable and HTTP 503 when the database is unavailable.

For a production build and run:

```powershell
npm run build
npm start
```

## Available scripts

- `npm run dev` — start the development server with watch mode
- `npm run build` — generate Prisma Client and compile TypeScript
- `npm start` — run the compiled server
- `npm run lint` / `npm run lint:fix` — check/fix ESLint issues
- `npm run format` / `npm run format:check` — format/check formatting
- `npm run prisma:migrate -- --name <migration>` — create/apply a development migration
- `npm run prisma:studio` — open Prisma Studio

## Project layout

- `src/config` — environment, Prisma, and Firebase initialization
- `src/controllers`, `src/services`, `src/repositories` — request, business, and persistence layers
- `src/middleware` — request logging, 404 handling, and centralized errors
- `src/routes` — API route registration
- `src/types`, `src/utils`, `src/validators` — shared contracts and helpers
- `prisma/schema.prisma` — PostgreSQL schema

The initial Prisma schema provides a minimal user record for later Firebase identity integration; it does not expose authentication or chat endpoints.

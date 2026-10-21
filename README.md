# Chat Backend Assessment — Phase 2

Backend foundation plus Phase 2 direct-chat creation and listing. Messaging is not implemented.

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
npx prisma migrate dev
npm run dev
```

The checked-in migration is `20261021000000_phase2_chats`. `migrate dev` applies it to the configured database and records it in Prisma's migration history.

The API listens on `http://localhost:3000` by default. Set `PORT` in `.env` to change it.

## Phase 2 endpoints

- `POST /api/chat/create` with JSON `{ "userAId": "...", "userBId": "..." }` creates or returns the same direct-chat ID. Both users must exist and must differ.
- `GET /api/user/:userId/chats` returns `{ "chats": [{ "chatId": "...", "participantIds": ["...", "..."] }] }`. A valid user without chats receives an empty array.
- `GET /api/health` checks API and PostgreSQL availability.

Direct-chat user IDs are canonicalized, and PostgreSQL enforces both canonical ordering and a unique composite pair. Concurrent requests therefore converge on one row. Chat creation, participant insertion, and user validation run in one database transaction.

## Verify

```powershell
npm test
npm run build
npm run lint
npm run format:check
```

Route tests use an in-memory repository and do not require PostgreSQL. Applying the migration and exercising the real persistence layer do require a reachable PostgreSQL instance and valid credentials in `.env`.

For a production build and run:

```powershell
npm run build
npm start
```

## Available scripts

- `npm run dev` — start the development server with watch mode
- `npm run build` — generate Prisma Client and compile TypeScript
- `npm start` — run the compiled server
- `npm test` — run HTTP route tests using an isolated in-memory repository
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

The migration creates users, direct chats, and chat participants. User records are assumed to be provisioned by a later authentication phase; this phase does not add user or messaging APIs.

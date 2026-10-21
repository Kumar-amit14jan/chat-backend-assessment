# Chat Backend Assessment — Phase 5 Audit

Backend foundation with direct chats, Firestore-backed messaging, read receipts, and last-seen progress. Group chats and delivery/read-receipt APIs beyond per-message read status are not implemented.

## Authentication and security scope

This assessment does **not** define or implement authentication endpoints, login, token issuance, or authentication middleware. User IDs supplied in request bodies, URL paths, or the `x-user-id` header are caller-controlled values and are **not secure authentication**. Membership checks enforce application-level access against those supplied IDs, but an unauthenticated caller can impersonate another ID. Do not deploy this API as production-secure or expose it to untrusted clients until a verified authentication layer derives the user ID from a validated credential and binds it to every request. The existing `User.firebaseUid` field does not by itself authenticate requests.

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

## Chat and messaging endpoints

- `POST /api/chat/create` with JSON `{ "userAId": "...", "userBId": "..." }` creates or returns the same direct-chat ID. Both users must exist and must differ. Returns 200 for both new and existing chats.
- `GET /api/user/:userId/chats` returns `{ "chats": [{ "chatId": "...", "participantIds": ["...", "..."] }] }`. A valid user without chats receives an empty array.
- `POST /api/chat/:chatId/message/send` with JSON `{ "senderId": "...", "text": "Hello" }` stores the trimmed message in Firestore and returns `{ "messageId": "...", "timestamp": "..." }`.
- `GET /api/chat/:chatId/messages?limit=50&cursor=...` requires an `x-user-id` header. It returns chronological messages plus `nextCursor`; limit is 1–100 and timestamp ties are ordered by Firestore document ID.
- `POST /api/chat/:chatId/message/:messageId/read` with JSON `{ "userId": "..." }` stores an idempotent per-user receipt at `chats/{chatId}/messages/{messageId}/readReceipts/{encodedUserId}`.
- `POST /api/chat/:chatId/lastseen` with JSON `{ "userId": "...", "messageId": "..." }` advances the user's Firestore last-seen state. Transactions prevent progress from moving backward; ties use message ID ordering.
- `GET /api/health` checks API and PostgreSQL availability.

Direct-chat user IDs are canonicalized, and PostgreSQL enforces a unique composite pair. Concurrent requests therefore converge on one row. Chat creation, participant insertion, and user validation run in one database transaction. PostgreSQL is the source of truth for users, chats, and chat participants. Firestore stores message documents, per-message read receipts, and last-seen state only; message content and receipt state are not written to PostgreSQL.

Message documents are stored only in Firestore under `chats/{chatId}/messages`. Firebase Admin is configured through the optional service-account environment values described above. In the current implementation, no trusted authentication layer sets `x-user-id`; it is simply a client-supplied identifier and must not be treated as proof of identity.

## Firestore Emulator integration test

The default test suite includes an integration test that is skipped unless `FIRESTORE_EMULATOR_HOST` is set. To run it against the Firebase Emulator Suite, start the Firestore emulator in one terminal (Firebase CLI required):

```powershell
firebase emulators:start --only firestore --project demo-chat-backend
```

Then run the tests in another PowerShell terminal:

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:GCLOUD_PROJECT = "demo-chat-backend"
npm test
Remove-Item Env:FIRESTORE_EMULATOR_HOST
Remove-Item Env:GCLOUD_PROJECT
```

The emulator test verifies persisted message ordering and cursor pagination, repeatable read receipts, and monotonic last-seen state. It uses a unique chat document and removes its data afterward. Without the emulator variable, HTTP tests run against in-memory repositories and the emulator test is reported as skipped.

Example requests:

```http
POST /api/chat/CHAT_ID/message/send
Content-Type: application/json

{"senderId":"USER_ID","text":"Hello"}
```

```http
GET /api/chat/CHAT_ID/messages?limit=50
x-user-id: USER_ID
```

```http
POST /api/chat/CHAT_ID/message/MESSAGE_ID/read
Content-Type: application/json

{"userId":"USER_ID"}
```

```http
POST /api/chat/CHAT_ID/lastseen
Content-Type: application/json

{"userId":"USER_ID","messageId":"MESSAGE_ID"}
```

## Verify

```powershell
npm test
npm run build
npm run lint
npm run format:check
```

Route tests use in-memory repositories and do not require PostgreSQL. The Firestore integration test requires the emulator as described above. Applying the migration and exercising real PostgreSQL persistence require a reachable PostgreSQL instance and valid credentials in `.env`.

For a production build and run:

```powershell
npm run build
npm start
```

## Available scripts

- `npm run dev` — start the development server with watch mode
- `npm run build` — generate Prisma Client and compile TypeScript
- `npm start` — run the compiled server
- `npm test` — run HTTP route tests using isolated in-memory repositories
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

The migration creates users, direct chats, and chat participants. User records are assumed to be provisioned by an authentication phase; this project does not implement authentication, group chats, or messaging features beyond direct-chat messages, read receipts, and last-seen progress.

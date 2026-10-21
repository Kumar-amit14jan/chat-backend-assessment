# Chat Backend Assessment — Chat API

TypeScript and Express backend for direct chats and messaging. PostgreSQL stores users, chats, and participants; Firestore stores messages, read receipts, and last-seen progress. The project includes request validation, repository/service separation, a Prisma migration, HTTP tests, an optional Firestore Emulator integration test, and an importable Postman collection.

## Architecture

```mermaid
flowchart LR
	Client[HTTP client / Postman] --> Routes[Express routes]
	Routes --> Validation[Zod request validation]
	Validation --> Controllers[Controllers]
	Controllers --> Services[Chat and message services]
	Services --> ChatRepo[Chat repository]
	Services --> MessageRepo[Message repository]
	ChatRepo --> Prisma[Prisma]
	Prisma --> PostgreSQL[(PostgreSQL\nusers, chats, participants)]
	MessageRepo --> Firebase[Firebase Admin SDK]
	Firebase --> Firestore[(Firestore\nmessages, read receipts, last-seen)]
	Controllers --> Errors[Structured request/error middleware]
```

**Data ownership:** PostgreSQL is authoritative for users, direct chats, and chat participants. Firestore exclusively owns message documents, read receipts, and last-seen state. A PostgreSQL migration enforces foreign keys, canonical participant ordering, uniqueness, and lookup indexes. Direct-chat creation validates users and inserts chat/participant rows transactionally; a unique pair constraint handles concurrent requests.

The main request flow is routes → Zod validation → controllers → services → repositories. PostgreSQL failures return generic server errors; Firestore operational failures return `503` without leaking provider details.

## Authentication and security scope

This assessment does **not** define or implement authentication endpoints, login, token issuance, or authentication middleware. User IDs supplied in request bodies, URL paths, or the `x-user-id` header are caller-controlled values and are **not secure authentication**. Membership checks enforce application-level access against those supplied IDs, but an unauthenticated caller can impersonate another ID. Do not deploy this API as production-secure or expose it to untrusted clients until a verified authentication layer derives the user ID from a validated credential and binds it to every request. The existing `User.firebaseUid` field does not by itself authenticate requests.

## Requirements and setup

- Node.js 20 or newer and npm
- PostgreSQL 14 or newer
- Firebase project/service account for real Firestore access, or Firebase Emulator Suite for local integration testing

## Setup

Install Node.js 20 or newer and npm. Start PostgreSQL 14 or newer (locally or with the optional Compose file below), then run from the project directory:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env.example`'s copied values in `.env`; replace placeholders. `DATABASE_URL` must point to the running PostgreSQL database. Its format is:

`postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public`

Create the database before applying the schema. Firebase variables are optional for HTTP tests; configure all three (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) together when using Firebase Admin with a real project, or leave them blank. Never commit real credentials or service-account files. Preserve escaped `\\n` sequences in `FIREBASE_PRIVATE_KEY` when entering it in `.env`.

### Optional PostgreSQL with Docker Compose

The included `compose.yaml` runs PostgreSQL 16 only; the API remains a local Node.js process. Copy `.env.example` to `.env`, replace the local database password placeholders consistently in `POSTGRES_PASSWORD` and `DATABASE_URL`, then start the database:

```powershell
docker compose up -d postgres
docker compose ps
```

Stop it with `docker compose down`. To also delete the local database volume, use `docker compose down -v` (destructive; removes persisted local database data).

## Database and run

```powershell
npx prisma generate
npx prisma migrate dev
npm run dev
```

The checked-in migration is `prisma/migrations/20261021000000_phase2_chats/migration.sql`. `prisma migrate dev` applies it to the configured database and records it in Prisma's migration history. Use `npx prisma migrate deploy` to apply already-created migrations in a deployment environment; do not use `migrate dev` for production.

The API listens on `http://localhost:3000` by default. Set `PORT` in `.env` to change it.

Users are assumed to be provisioned by an upstream user/authentication phase. This repository has no user creation or seed endpoint; create test user rows through an approved local database workflow before trying chat creation.

## API reference

Base URL: `http://localhost:3000`. All request/response bodies are JSON where applicable. IDs in examples are placeholders; the two users must already exist in PostgreSQL.

| Method and path                                  | Purpose                              | Success |
| ------------------------------------------------ | ------------------------------------ | ------- |
| `POST /api/chat/create`                          | Create/get a direct chat             | `200`   |
| `GET /api/user/:userId/chats`                    | List a user's chats                  | `200`   |
| `POST /api/chat/:chatId/message/send`            | Send a message                       | `201`   |
| `GET /api/chat/:chatId/messages`                 | List messages with cursor pagination | `200`   |
| `POST /api/chat/:chatId/message/:messageId/read` | Mark a message read                  | `200`   |
| `POST /api/chat/:chatId/lastseen`                | Advance last-seen progress           | `200`   |
| `GET /api/health`                                | Check API/PostgreSQL health          | `200`   |

Error responses by endpoint: the chat create and chat-list endpoints can return `400`, `404`, or `500`; message send can return `400`, `403`, `404`, or `503`; message list can return `400`, `403`, `404`, or `503`; read receipt and last-seen can return `400`, `403`, `404`, or `503`; health returns `503` when PostgreSQL is down. Unknown paths return `404`. A general `500` indicates an unexpected server/database failure; details are not exposed.

### 1. Create or get a direct chat

`POST /api/chat/create`

```json
{ "userAId": "USER_A_ID", "userBId": "USER_B_ID" }
```

Success (`200`, including when the chat already exists):

```json
{ "chatId": "CHAT_ID" }
```

`400` for invalid/equal IDs; `404` if one or both users do not exist. Concurrent equivalent requests return the same chat ID.

### 2. List chats for a user

`GET /api/user/USER_ID/chats`

Success (`200`):

```json
{
  "chats": [
    {
      "chatId": "CHAT_ID",
      "participantIds": ["USER_A_ID", "USER_B_ID"],
      "createdAt": "2026-10-22T12:00:00.000Z"
    }
  ]
}
```

Returns `{"chats":[]}` for an existing user with no chats. `400` for invalid ID; `404` if the user does not exist.

### 3. Send a message

`POST /api/chat/CHAT_ID/message/send`

```json
{ "senderId": "USER_ID", "text": "Hello" }
```

Success (`201`):

```json
{ "messageId": "MESSAGE_ID", "timestamp": "2026-10-22T12:00:00.000Z" }
```

Text is trimmed and must contain 1–4000 characters. `400` for validation errors; `403` if the supplied sender ID is not a chat participant; `404` if the chat does not exist; `503` if Firestore is unavailable.

### 4. List messages

`GET /api/chat/CHAT_ID/messages?limit=50&cursor=CURSOR` (both query parameters are optional; default limit is 50, maximum 100). Send the `x-user-id: USER_ID` header.

Success (`200`):

```json
{
  "messages": [
    {
      "messageId": "MESSAGE_ID",
      "senderId": "USER_ID",
      "text": "Hello",
      "timestamp": "2026-10-22T12:00:00.000Z"
    }
  ],
  "nextCursor": "BASE64URL_CURSOR_OR_NULL"
}
```

Messages are ordered by Firestore timestamp and then document ID. Pass the returned `nextCursor` unchanged to fetch the next page. `400` for missing `x-user-id`, invalid limit/cursor; `403` for non-members; `404` if chat is missing; `503` if Firestore is unavailable.

### 5. Mark a message as read

`POST /api/chat/CHAT_ID/message/MESSAGE_ID/read`

```json
{ "userId": "USER_ID" }
```

Success (`200`): `{ "readAt": "2026-10-22T12:00:00.000Z" }`. Repeated calls for the same user/message are idempotent and retain the original timestamp. `400` for invalid input; `403` for non-members; `404` if chat or message is missing; `503` if Firestore is unavailable.

### 6. Advance last-seen progress

`POST /api/chat/CHAT_ID/lastseen`

```json
{ "userId": "USER_ID", "messageId": "MESSAGE_ID" }
```

Success (`200`):

```json
{
  "lastSeenMessageId": "MESSAGE_ID",
  "lastSeenAt": "2026-10-22T12:00:00.000Z",
  "updated": true
}
```

Progress never moves backward; an older/equal request returns `updated: false` and the persisted progress. Timestamp ties use message ID ordering. `400` for invalid input; `403` for non-members; `404` if chat or message is missing; `503` if Firestore is unavailable.

### Health and common errors

`GET /api/health` returns `200` when PostgreSQL is available, for example `{"status":"ok","timestamp":"2026-10-22T12:00:00.000Z","dependencies":{"database":"up"}}`; returns `503` with `status: "degraded"` if the database check fails.

Errors have a consistent envelope, e.g. `{"error":{"message":"Request validation failed","details":{}}}`. `400` indicates request validation/parsing failure, `403` membership denial, `404` missing route/resource, `413` oversized JSON, `500` unexpected PostgreSQL/server error, and `503` unavailable Firestore or degraded health. Server/provider internals are not returned.

### Authentication limitation

This assessment does **not** define or implement authentication endpoints, login, token issuance, or authentication middleware. IDs in request bodies, URL paths, and the `x-user-id` header are client-controlled, **not secure authentication**. Although the API performs membership checks using those IDs, a caller can impersonate another user. Do not claim production security or expose this API to untrusted clients until trusted middleware verifies credentials and derives the user identity. The existing `User.firebaseUid` column does not itself authenticate requests.

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

## Postman

Import [postman/chat-backend-assessment.postman_collection.json](postman/chat-backend-assessment.postman_collection.json) into Postman. Set `baseUrl`, `userAId`, `userBId`, and `userId` collection variables; IDs must refer to existing PostgreSQL users, and `userId` should be a participant in the chat. Run **Create or get direct chat**, then **Send message**. The collection captures `chatId` and `messageId` for the remaining operations. **List messages** omits `cursor` on the first request and automatically uses a returned cursor on a subsequent request. The collection covers all six chat endpoints plus the health endpoint. It contains no credentials or tokens; supplied IDs are not authentication.

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
npm run lint
npm run format:check
npm run build
```

Route tests use in-memory repositories and do not require PostgreSQL. The Firestore integration test requires the emulator as described above. Applying the migration and exercising real PostgreSQL persistence require a reachable PostgreSQL instance and valid credentials in `.env`.

For a production build and run:

```powershell
npm run build
npm start
```

## Available scripts

- `npm run dev` – start the development server with watch mode
- `npm run build` – generate Prisma Client and compile TypeScript
- `npm start` – run the compiled server
- `npm test` – run HTTP route tests using isolated in-memory repositories
- `npm run lint` / `npm run lint:fix` – check/fix ESLint issues
- `npm run format` / `npm run format:check` – format/check formatting
- `npm run prisma:deploy` – apply checked-in migrations with `prisma migrate deploy` (deployment use)
- `npm run prisma:migrate -- --name <migration>` – create/apply a development migration
- `npm run prisma:studio` – open Prisma Studio

The migration is committed under `prisma/migrations/` with `prisma/migrations/migration_lock.toml`. Schema edits should be followed by a new migration committed with the schema; deployments apply committed migrations rather than generating them.

## Project layout

- `src/config` – environment, Prisma, and Firebase initialization
- `src/controllers`, `src/services`, `src/repositories` – request, business, and persistence layers
- `src/middleware` – request logging, 404 handling, and centralized errors
- `src/routes` – API route registration
- `src/types`, `src/utils`, `src/validators` – shared contracts and helpers
- `prisma/schema.prisma` – PostgreSQL schema

The migration creates users, direct chats, and chat participants. User records are assumed to be provisioned by an authentication phase; this project does not implement authentication, group chats, or messaging features beyond direct-chat messages, read receipts, and last-seen progress.

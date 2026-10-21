CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "directUserLowId" TEXT NOT NULL,
    "directUserHighId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Chat_direct_users_canonical_order_check"
        CHECK ("directUserLowId" COLLATE "C" < "directUserHighId" COLLATE "C")
);

CREATE TABLE "ChatParticipant" (
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("chatId", "userId")
);

CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Chat_directUserLowId_directUserHighId_key"
    ON "Chat"("directUserLowId", "directUserHighId");
CREATE INDEX "Chat_directUserLowId_createdAt_idx" ON "Chat"("directUserLowId", "createdAt");
CREATE INDEX "Chat_directUserHighId_createdAt_idx" ON "Chat"("directUserHighId", "createdAt");
CREATE INDEX "ChatParticipant_userId_chatId_idx" ON "ChatParticipant"("userId", "chatId");

ALTER TABLE "Chat"
    ADD CONSTRAINT "Chat_directUserLowId_fkey"
    FOREIGN KEY ("directUserLowId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chat"
    ADD CONSTRAINT "Chat_directUserHighId_fkey"
    FOREIGN KEY ("directUserHighId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatParticipant"
    ADD CONSTRAINT "ChatParticipant_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatParticipant"
    ADD CONSTRAINT "ChatParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
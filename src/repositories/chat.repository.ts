import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma';
import { UserNotFoundError } from '../utils/user-not-found-error';

export interface CreateDirectChatResult {
  chatId: string;
  created: boolean;
}

export interface UserChatSummary {
  chatId: string;
  participantIds: string[];
  createdAt: Date;
}

export interface ChatRepositoryContract {
  createOrGetDirectChat(userLowId: string, userHighId: string): Promise<CreateDirectChatResult>;
  listUserChats(userId: string): Promise<UserChatSummary[]>;
}

export class ChatRepository implements ChatRepositoryContract {
  async createOrGetDirectChat(
    userLowId: string,
    userHighId: string,
  ): Promise<CreateDirectChatResult> {
    return prisma.$transaction(async (transaction) => {
      const users = await transaction.user.findMany({
        where: { id: { in: [userLowId, userHighId] } },
        select: { id: true },
      });
      const foundIds = new Set(users.map((user) => user.id));
      const missingIds = [userLowId, userHighId].filter((userId) => !foundIds.has(userId));

      if (missingIds.length > 0) {
        throw new UserNotFoundError(missingIds);
      }

      // The unique pair constraint makes this insert safe when requests race.
      const inserted = await transaction.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "Chat" ("id", "directUserLowId", "directUserHighId", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${userLowId}, ${userHighId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("directUserLowId", "directUserHighId") DO NOTHING
        RETURNING "id"
      `;
      const created = inserted.length === 1;
      const existing = created
        ? inserted[0]
        : await transaction.chat.findUnique({
            where: {
              directUserPair: { directUserLowId: userLowId, directUserHighId: userHighId },
            },
            select: { id: true },
          });

      if (!existing) {
        throw new Error('Chat insert conflicted but the existing chat could not be found');
      }

      await transaction.chatParticipant.createMany({
        data: [
          { chatId: existing.id, userId: userLowId },
          { chatId: existing.id, userId: userHighId },
        ],
        skipDuplicates: true,
      });

      return { chatId: existing.id, created };
    });
  }

  async listUserChats(userId: string): Promise<UserChatSummary[]> {
    return prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw new UserNotFoundError([userId]);

      const chats = await transaction.chat.findMany({
        where: { OR: [{ directUserLowId: userId }, { directUserHighId: userId }] },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          participants: { select: { userId: true }, orderBy: { userId: 'asc' } },
        },
      });

      return chats.map((chat) => ({
        chatId: chat.id,
        participantIds: chat.participants.map((participant) => participant.userId),
        createdAt: chat.createdAt,
      }));
    });
  }
}

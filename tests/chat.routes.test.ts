import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import type {
  ChatRepositoryContract,
  CreateDirectChatResult,
  UserChatSummary,
} from '../src/repositories/chat.repository';
import { ChatService } from '../src/services/chat.service';
import { UserNotFoundError } from '../src/utils/user-not-found-error';

class MemoryChatRepository implements ChatRepositoryContract {
  private readonly users = new Set(['alice', 'bob', 'carol', 'solo']);
  private readonly chats = new Map<string, UserChatSummary>();
  private readonly pairToChatId = new Map<string, string>();
  private nextId = 1;

  async createOrGetDirectChat(
    userLowId: string,
    userHighId: string,
  ): Promise<CreateDirectChatResult> {
    const missing = [userLowId, userHighId].filter((userId) => !this.users.has(userId));
    if (missing.length > 0) throw new UserNotFoundError(missing);

    const pair = `${userLowId}\u0000${userHighId}`;
    const existingChatId = this.pairToChatId.get(pair);
    if (existingChatId) return { chatId: existingChatId, created: false };

    const chatId = `chat-${this.nextId++}`;
    this.pairToChatId.set(pair, chatId);
    this.chats.set(chatId, {
      chatId,
      participantIds: [userLowId, userHighId],
      createdAt: new Date(),
    });
    return { chatId, created: true };
  }

  async listUserChats(userId: string): Promise<UserChatSummary[]> {
    if (!this.users.has(userId)) throw new UserNotFoundError([userId]);
    return [...this.chats.values()].filter((chat) => chat.participantIds.includes(userId));
  }
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = createApp(new ChatService(new MemoryChatRepository()));
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('POST /api/chat/create creates a direct chat and GET returns participant IDs', async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/chat/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userAId: 'alice', userBId: 'bob' }),
    });
    assert.equal(createResponse.status, 200);
    const created = (await createResponse.json()) as { chatId: string };
    assert.ok(created.chatId);

    const listResponse = await fetch(`${baseUrl}/api/user/alice/chats`);
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as {
      chats: Array<{ chatId: string; participantIds: string[] }>;
    };
    assert.equal(listed.chats.length, 1);
    assert.equal(listed.chats[0].chatId, created.chatId);
    assert.deepEqual(listed.chats[0].participantIds, ['alice', 'bob']);
    assert.ok(Number.isFinite(Date.parse(listed.chats[0].createdAt)));
  });
});

test('POST /api/chat/create returns 404 if either user does not exist', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userAId: 'alice', userBId: 'unknown' }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        message: 'One or more users do not exist',
        details: { missingUserIds: ['unknown'] },
      },
    });
  });
});

test('POST /api/chat/create rejects identical user IDs', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userAId: 'alice', userBId: 'alice' }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { message: string } };
    assert.equal(body.error.message, 'Request validation failed');
  });
});

test('concurrent duplicate requests, including reversed IDs, return one chat ID', async () => {
  await withServer(async (baseUrl) => {
    const post = (userAId: string, userBId: string) =>
      fetch(`${baseUrl}/api/chat/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userAId, userBId }),
      });

    const responses = await Promise.all([post('alice', 'bob'), post('bob', 'alice')]);
    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200],
    );
    const results = await Promise.all(
      responses.map((response) => response.json() as Promise<{ chatId: string }>),
    );
    assert.equal(results[0].chatId, results[1].chatId);

    const listResponse = await fetch(`${baseUrl}/api/user/bob/chats`);
    const listed = (await listResponse.json()) as { chats: UserChatSummary[] };
    assert.equal(listed.chats.length, 1);
  });
});

test('GET /api/user/:userId/chats returns an empty list for a user without chats', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/user/solo/chats`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { chats: [] });
  });
});

test('GET /api/user/:userId/chats returns 404 for an unknown user', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/user/unknown/chats`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        message: 'One or more users do not exist',
        details: { missingUserIds: ['unknown'] },
      },
    });
  });
});

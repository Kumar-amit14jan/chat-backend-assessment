import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import type { ChatAccess } from '../src/repositories/chat.repository';
import {
  decodeMessageCursor,
  encodeMessageCursor,
  type ChatMessage,
  type MessagePage,
  type MessageRepositoryContract,
  MissingMessageError,
} from '../src/repositories/message.repository';
import { MessageService } from '../src/services/message.service';

class MemoryChatAccessRepository {
  private readonly chats = new Map([
    ['chat1', new Set(['alice', 'bob'])],
    ['chat2', new Set(['alice', 'bob'])],
  ]);

  async getChatAccess(chatId: string, userId: string): Promise<ChatAccess> {
    const participants = this.chats.get(chatId);
    if (!participants) return 'chat-not-found';
    return participants.has(userId) ? 'participant' : 'not-a-participant';
  }
}

class MemoryMessageRepository implements MessageRepositoryContract {
  readonly messages: ChatMessage[] = [];
  readonly receipts = new Map<string, string>();
  readonly lastSeen = new Map<string, { messageId: string; at: string }>();
  private readonly chatForMessage = new Map<string, string>();
  failCreate = false;
  failList = false;
  failMarkRead = false;
  failUpdateLastSeen = false;
  private nextId = 1;

  async create(chatId: string, senderId: string, text: string): Promise<ChatMessage> {
    if (this.failCreate) throw new Error('Firestore write failed');
    const message = {
      messageId: `message-${this.nextId++}`,
      senderId,
      text,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, this.nextId)).toISOString(),
    };
    this.messages.push(message);
    this.chatForMessage.set(message.messageId, chatId);
    return message;
  }

  seed(chatId: string, message: ChatMessage): void {
    this.messages.push(message);
    this.chatForMessage.set(message.messageId, chatId);
  }

  async list(chatId: string, limit: number, cursor?: string): Promise<MessagePage> {
    if (this.failList) throw new Error('Firestore read failed');
    const sorted = this.messages
      .filter((message) => this.chatForMessage.get(message.messageId) === chatId)
      .sort((left, right) => {
        const byTimestamp = left.timestamp.localeCompare(right.timestamp);
        return byTimestamp || left.messageId.localeCompare(right.messageId);
      });
    const decoded = cursor ? decodeMessageCursor(cursor) : null;
    const startIndex = decoded
      ? sorted.findIndex((message) => {
          const seconds = Math.floor(Date.parse(message.timestamp) / 1000);
          return (
            seconds > decoded.seconds ||
            (seconds === decoded.seconds && message.messageId > decoded.messageId)
          );
        })
      : 0;
    const available = sorted.slice(startIndex < 0 ? sorted.length : startIndex);
    const messages = available.slice(0, limit);
    const hasMore = available.length > limit;
    const last = messages.at(-1);
    const lastTime = last ? Date.parse(last.timestamp) : 0;

    return {
      messages,
      nextCursor:
        hasMore && last
          ? encodeMessageCursor({
              seconds: Math.floor(lastTime / 1000),
              nanoseconds: (lastTime % 1000) * 1_000_000,
              messageId: last.messageId,
            })
          : null,
    };
  }

  async markRead(chatId: string, messageId: string, userId: string): Promise<{ readAt: string }> {
    if (this.failMarkRead) throw new Error('Firestore receipt write failed');
    const message = this.messages.find(
      (item) => item.messageId === messageId && this.chatForMessage.get(item.messageId) === chatId,
    );
    if (!message) throw new MissingMessageError();
    const key = `${chatId}:${messageId}:${userId}`;
    const readAt = this.receipts.get(key) ?? new Date().toISOString();
    this.receipts.set(key, readAt);
    return { readAt };
  }

  async updateLastSeen(
    chatId: string,
    messageId: string,
    userId: string,
  ): Promise<{ lastSeenMessageId: string; lastSeenAt: string; updated: boolean }> {
    if (this.failUpdateLastSeen) throw new Error('Firestore last-seen write failed');
    const message = this.messages.find(
      (item) => item.messageId === messageId && this.chatForMessage.get(item.messageId) === chatId,
    );
    if (!message) throw new MissingMessageError();
    const key = `${chatId}:${userId}`;
    const current = this.lastSeen.get(key);
    const currentMessage =
      current &&
      this.messages.find(
        (item) =>
          item.messageId === current.messageId &&
          this.chatForMessage.get(item.messageId) === chatId,
      );
    const candidateProgress = `${message.timestamp}\u0000${message.messageId}`;
    const currentProgress =
      currentMessage && `${currentMessage.timestamp}\u0000${currentMessage.messageId}`;

    if (current && currentProgress && candidateProgress <= currentProgress) {
      return {
        lastSeenMessageId: current.messageId,
        lastSeenAt: current.at,
        updated: false,
      };
    }

    const at = new Date().toISOString();
    this.lastSeen.set(key, { messageId, at });
    return { lastSeenMessageId: messageId, lastSeenAt: at, updated: true };
  }
}

async function withMessageServer(
  run: (baseUrl: string, repository: MemoryMessageRepository) => Promise<void>,
): Promise<void> {
  const repository = new MemoryMessageRepository();
  const service = new MessageService(new MemoryChatAccessRepository(), repository);
  const server = createApp(undefined, service).listen(0);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${address.port}`, repository);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('POST /api/chat/:chatId/message/send stores trimmed text and returns ID/timestamp', async () => {
  await withMessageServer(async (baseUrl, repository) => {
    const response = await fetch(`${baseUrl}/api/chat/chat1/message/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderId: 'alice', text: '  hello there  ' }),
    });
    assert.equal(response.status, 201);
    const result = (await response.json()) as { messageId: string; timestamp: string };
    assert.equal(result.messageId, 'message-1');
    assert.ok(Number.isFinite(Date.parse(result.timestamp)));
    assert.equal(repository.messages[0].text, 'hello there');
  });
});

test('message sending rejects empty or whitespace-only text', async () => {
  await withMessageServer(async (baseUrl, repository) => {
    const response = await fetch(`${baseUrl}/api/chat/chat1/message/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderId: 'alice', text: '   ' }),
    });
    assert.equal(response.status, 400);
    assert.equal(repository.messages.length, 0);
  });
});

test('malformed JSON receives a safe 400 response', async () => {
  await withMessageServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/chat1/message/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid json',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { message: 'Invalid JSON request body' },
    });
  });
});

test('message listing requires a user ID and rejects malformed cursors', async () => {
  await withMessageServer(async (baseUrl) => {
    const missingUser = await fetch(`${baseUrl}/api/chat/chat1/messages`);
    assert.equal(missingUser.status, 400);

    const invalidCursor = await fetch(`${baseUrl}/api/chat/chat1/messages?cursor=not-a-cursor`, {
      headers: { 'x-user-id': 'alice' },
    });
    assert.equal(invalidCursor.status, 400);
  });
});

test('message endpoints reject malformed and unknown chat IDs', async () => {
  await withMessageServer(async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/chat/bad%21/messages`, {
      headers: { 'x-user-id': 'alice' },
    });
    assert.equal(malformed.status, 400);

    const missing = await fetch(`${baseUrl}/api/chat/missing/messages`, {
      headers: { 'x-user-id': 'alice' },
    });
    assert.equal(missing.status, 404);
  });
});

test('only chat participants may send messages or read messages', async () => {
  await withMessageServer(async (baseUrl) => {
    const send = await fetch(`${baseUrl}/api/chat/chat1/message/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderId: 'mallory', text: 'intrusion' }),
    });
    assert.equal(send.status, 403);

    const read = await fetch(`${baseUrl}/api/chat/chat1/messages`, {
      headers: { 'x-user-id': 'mallory' },
    });
    assert.equal(read.status, 403);
  });
});

test('Firestore failures return 503 for writes and reads', async () => {
  await withMessageServer(async (baseUrl, repository) => {
    repository.failCreate = true;
    const send = await fetch(`${baseUrl}/api/chat/chat1/message/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderId: 'alice', text: 'hello' }),
    });
    assert.equal(send.status, 503);

    repository.failList = true;
    const read = await fetch(`${baseUrl}/api/chat/chat1/messages`, {
      headers: { 'x-user-id': 'alice' },
    });
    assert.equal(read.status, 503);
  });
});

test('Firestore receipt and last-seen failures return safe 503 responses', async () => {
  await withMessageServer(async (baseUrl, repository) => {
    repository.seed('chat1', {
      messageId: 'message-failure',
      senderId: 'alice',
      text: 'hello',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    repository.failMarkRead = true;
    const receiptResponse = await fetch(`${baseUrl}/api/chat/chat1/message/message-failure/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'alice' }),
    });
    assert.equal(receiptResponse.status, 503);
    assert.doesNotMatch(await receiptResponse.text(), /Firestore receipt write failed/);

    repository.failUpdateLastSeen = true;
    const lastSeenResponse = await fetch(`${baseUrl}/api/chat/chat1/lastseen`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'alice', messageId: 'message-failure' }),
    });
    assert.equal(lastSeenResponse.status, 503);
    assert.doesNotMatch(await lastSeenResponse.text(), /Firestore last-seen write failed/);
  });
});

test('message listing is chronologically ordered and cursor pages do not overlap', async () => {
  await withMessageServer(async (baseUrl, repository) => {
    [
      {
        messageId: 'c-message',
        senderId: 'alice',
        text: 'third',
        timestamp: '2026-01-01T00:00:02.000Z',
      },
      {
        messageId: 'b-message',
        senderId: 'bob',
        text: 'second',
        timestamp: '2026-01-01T00:00:01.000Z',
      },
      {
        messageId: 'a-message',
        senderId: 'alice',
        text: 'first',
        timestamp: '2026-01-01T00:00:01.000Z',
      },
    ].forEach((message) => repository.seed('chat1', message));

    const firstResponse = await fetch(`${baseUrl}/api/chat/chat1/messages?limit=2`, {
      headers: { 'x-user-id': 'alice' },
    });
    assert.equal(firstResponse.status, 200);
    const firstPage = (await firstResponse.json()) as MessagePage;
    assert.deepEqual(
      firstPage.messages.map((message) => message.messageId),
      ['a-message', 'b-message'],
    );
    assert.ok(firstPage.nextCursor);

    const secondResponse = await fetch(
      `${baseUrl}/api/chat/chat1/messages?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
      { headers: { 'x-user-id': 'alice' } },
    );
    const secondPage = (await secondResponse.json()) as MessagePage;
    assert.deepEqual(
      secondPage.messages.map((message) => message.messageId),
      ['c-message'],
    );
    assert.equal(secondPage.nextCursor, null);
  });
});

test('message listing rejects limits over the configured maximum', async () => {
  await withMessageServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/chat1/messages?limit=101`, {
      headers: { 'x-user-id': 'alice' },
    });
    assert.equal(response.status, 400);
  });
});

test('read receipt rejects an invalid message ID', async () => {
  await withMessageServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/chat1/message/missing/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'alice' }),
    });
    assert.equal(response.status, 404);
  });
});

test('read receipt rejects non-members and repeated requests are idempotent', async () => {
  await withMessageServer(async (baseUrl, repository) => {
    repository.seed('chat1', {
      messageId: 'message-read',
      senderId: 'alice',
      text: 'hello',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const nonMember = await fetch(`${baseUrl}/api/chat/chat1/message/message-read/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'mallory' }),
    });
    assert.equal(nonMember.status, 403);

    const url = `${baseUrl}/api/chat/chat1/message/message-read/read`;
    const request = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'alice' }),
      });
    const first = await request();
    const firstReceipt = (await first.json()) as { readAt: string };
    const second = await request();
    const secondReceipt = (await second.json()) as { readAt: string };
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(firstReceipt.readAt, secondReceipt.readAt);
    assert.equal(repository.receipts.size, 1);
  });
});

test('last-seen rejects a message from another chat and a non-member', async () => {
  await withMessageServer(async (baseUrl, repository) => {
    repository.seed('chat2', {
      messageId: 'other-chat-message',
      senderId: 'alice',
      text: 'not in chat1',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const nonMember = await fetch(`${baseUrl}/api/chat/chat1/lastseen`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'mallory', messageId: 'other-chat-message' }),
    });
    assert.equal(nonMember.status, 403);

    const missingMessage = await fetch(`${baseUrl}/api/chat/chat1/lastseen`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'alice', messageId: 'missing' }),
    });
    assert.equal(missingMessage.status, 404);
  });
});

test('last-seen progress cannot move backward', async () => {
  await withMessageServer(async (baseUrl, repository) => {
    [
      {
        messageId: 'message-early',
        senderId: 'alice',
        text: 'early',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      {
        messageId: 'message-late',
        senderId: 'bob',
        text: 'late',
        timestamp: '2026-01-01T00:00:05.000Z',
      },
    ].forEach((message) => repository.seed('chat1', message));

    const postLastSeen = (messageId: string) =>
      fetch(`${baseUrl}/api/chat/chat1/lastseen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'alice', messageId }),
      });

    const advanced = await postLastSeen('message-late');
    assert.equal(advanced.status, 200);
    const firstState = (await advanced.json()) as { lastSeenMessageId: string; updated: boolean };
    assert.equal(firstState.lastSeenMessageId, 'message-late');
    assert.equal(firstState.updated, true);

    const regressed = await postLastSeen('message-early');
    const unchanged = (await regressed.json()) as {
      lastSeenMessageId: string;
      updated: boolean;
    };
    assert.equal(unchanged.lastSeenMessageId, 'message-late');
    assert.equal(unchanged.updated, false);
    assert.equal(repository.lastSeen.get('chat1:alice')?.messageId, 'message-late');
  });
});

test('last-seen uses message ID ordering to keep equal-timestamp progress monotonic', async () => {
  await withMessageServer(async (baseUrl, repository) => {
    repository.seed('chat1', {
      messageId: 'message-a',
      senderId: 'alice',
      text: 'earlier tie-breaker',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    repository.seed('chat1', {
      messageId: 'message-z',
      senderId: 'bob',
      text: 'later tie-breaker',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const postLastSeen = (messageId: string) =>
      fetch(`${baseUrl}/api/chat/chat1/lastseen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'alice', messageId }),
      });

    await postLastSeen('message-z');
    const regressed = await postLastSeen('message-a');
    const state = (await regressed.json()) as {
      lastSeenMessageId: string;
      updated: boolean;
    };
    assert.equal(state.lastSeenMessageId, 'message-z');
    assert.equal(state.updated, false);
  });
});

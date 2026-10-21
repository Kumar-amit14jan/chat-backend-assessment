import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseApp } from '../src/config/firebase';
import {
  FirestoreMessageRepository,
  type ChatMessage,
} from '../src/repositories/message.repository';

const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test(
  'Firestore emulator persists ordered messages, idempotent receipts, and monotonic last-seen state',
  { skip: !emulatorEnabled },
  async () => {
    assert.ok(firebaseApp, 'Firebase Admin should initialize when the emulator is configured');
    const database = getFirestore(firebaseApp);
    const repository = new FirestoreMessageRepository();
    const chatId = `emulator-${randomUUID()}`;

    try {
      const first = await repository.create(chatId, 'alice', 'first');
      const second = await repository.create(chatId, 'bob', 'second');
      const page = await repository.list(chatId, 1);
      assert.equal(page.messages.length, 1);
      assert.ok(page.nextCursor);

      const nextPage = await repository.list(chatId, 1, page.nextCursor);
      assert.equal(nextPage.messages.length, 1);
      assert.equal(nextPage.nextCursor, null);
      const orderedMessages = [...page.messages, ...nextPage.messages];
      assert.deepEqual(
        orderedMessages.map((message: ChatMessage) => message.messageId).sort(),
        [first.messageId, second.messageId].sort(),
      );
      assert.ok(
        orderedMessages[0].timestamp < orderedMessages[1].timestamp ||
          (orderedMessages[0].timestamp === orderedMessages[1].timestamp &&
            orderedMessages[0].messageId < orderedMessages[1].messageId),
      );

      const firstMessage = orderedMessages[0];
      const lastMessage = orderedMessages[1];
      const firstReceipt = await repository.markRead(chatId, firstMessage.messageId, 'reader/one');
      const repeatedReceipt = await repository.markRead(
        chatId,
        firstMessage.messageId,
        'reader/one',
      );
      assert.equal(firstReceipt.readAt, repeatedReceipt.readAt);

      const advanced = await repository.updateLastSeen(chatId, lastMessage.messageId, 'reader/one');
      const regressed = await repository.updateLastSeen(
        chatId,
        firstMessage.messageId,
        'reader/one',
      );
      assert.equal(advanced.lastSeenMessageId, lastMessage.messageId);
      assert.equal(advanced.updated, true);
      assert.equal(regressed.lastSeenMessageId, lastMessage.messageId);
      assert.equal(regressed.updated, false);
    } finally {
      await database.recursiveDelete(database.collection('chats').doc(chatId));
    }
  },
);

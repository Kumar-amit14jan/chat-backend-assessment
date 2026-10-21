import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
} from 'firebase-admin/firestore';
import { firebaseApp } from '../config/firebase';

export interface MessageCursor {
  seconds: number;
  nanoseconds: number;
  messageId: string;
}

export interface ChatMessage {
  messageId: string;
  senderId: string;
  text: string;
  timestamp: string;
}

export interface MessagePage {
  messages: ChatMessage[];
  nextCursor: string | null;
}

export interface MessageRepositoryContract {
  create(chatId: string, senderId: string, text: string): Promise<ChatMessage>;
  list(chatId: string, limit: number, cursor?: string): Promise<MessagePage>;
  markRead(chatId: string, messageId: string, userId: string): Promise<{ readAt: string }>;
  updateLastSeen(
    chatId: string,
    messageId: string,
    userId: string,
  ): Promise<{ lastSeenMessageId: string; lastSeenAt: string; updated: boolean }>;
}

export class MessageStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MessageStoreError';
  }
}

export class InvalidMessageCursorError extends Error {
  constructor() {
    super('Invalid message pagination cursor');
    this.name = 'InvalidMessageCursorError';
  }
}

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeMessageCursor(value: string): MessageCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('seconds' in parsed) ||
      !('nanoseconds' in parsed) ||
      !('messageId' in parsed) ||
      typeof parsed.seconds !== 'number' ||
      !Number.isSafeInteger(parsed.seconds) ||
      typeof parsed.nanoseconds !== 'number' ||
      !Number.isInteger(parsed.nanoseconds) ||
      parsed.nanoseconds < 0 ||
      parsed.nanoseconds >= 1_000_000_000 ||
      typeof parsed.messageId !== 'string' ||
      parsed.messageId.length === 0
    ) {
      throw new Error('Invalid cursor payload');
    }

    return parsed as MessageCursor;
  } catch {
    throw new InvalidMessageCursorError();
  }
}

function getDatabase() {
  if (!firebaseApp) throw new MessageStoreError('Firebase Admin is not configured');
  return getFirestore(firebaseApp);
}

function firestoreUserKey(userId: string): string {
  return Buffer.from(userId, 'utf8').toString('base64url');
}

function toChatMessage(messageId: string, data: DocumentData): ChatMessage {
  if (!(data.createdAt instanceof Timestamp)) {
    throw new MessageStoreError('Stored message has no committed Firestore timestamp');
  }

  return {
    messageId,
    senderId: String(data.senderId),
    text: String(data.text),
    timestamp: data.createdAt.toDate().toISOString(),
  };
}

export class FirestoreMessageRepository implements MessageRepositoryContract {
  async create(chatId: string, senderId: string, text: string): Promise<ChatMessage> {
    try {
      const collection = getDatabase().collection('chats').doc(chatId).collection('messages');
      const reference = collection.doc();
      await reference.create({ senderId, text, createdAt: FieldValue.serverTimestamp() });
      const snapshot = await reference.get();

      if (!snapshot.exists) throw new Error('Message was not available after writing');
      return toChatMessage(snapshot.id, snapshot.data() ?? {});
    } catch (error) {
      if (error instanceof MessageStoreError) throw error;
      throw new MessageStoreError('Failed to write message to Firestore', { cause: error });
    }
  }

  async list(chatId: string, limit: number, cursor?: string): Promise<MessagePage> {
    try {
      const collection = getDatabase().collection('chats').doc(chatId).collection('messages');
      let query = collection.orderBy('createdAt', 'asc').orderBy(FieldPath.documentId(), 'asc');

      if (cursor) {
        const decoded = decodeMessageCursor(cursor);
        query = query.startAfter(
          new Timestamp(decoded.seconds, decoded.nanoseconds),
          decoded.messageId,
        );
      }

      const snapshot = await query.limit(limit + 1).get();
      const page = snapshot.docs.slice(0, limit);
      const hasMore = snapshot.docs.length > limit;
      const lastSnapshot = page.at(-1);
      const lastTimestamp = lastSnapshot?.get('createdAt');

      if (lastSnapshot && !(lastTimestamp instanceof Timestamp)) {
        throw new MessageStoreError('Stored message has no committed Firestore timestamp');
      }

      return {
        messages: page.map((document) => toChatMessage(document.id, document.data())),
        nextCursor:
          hasMore && lastSnapshot && lastTimestamp instanceof Timestamp
            ? encodeMessageCursor({
                seconds: lastTimestamp.seconds,
                nanoseconds: lastTimestamp.nanoseconds,
                messageId: lastSnapshot.id,
              })
            : null,
      };
    } catch (error) {
      if (error instanceof MessageStoreError || error instanceof InvalidMessageCursorError) {
        throw error;
      }
      throw new MessageStoreError('Failed to read messages from Firestore', { cause: error });
    }
  }

  async markRead(chatId: string, messageId: string, userId: string): Promise<{ readAt: string }> {
    try {
      const database = getDatabase();
      const messageReference = database
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .doc(messageId);
      const receiptReference = messageReference
        .collection('readReceipts')
        .doc(firestoreUserKey(userId));

      await database.runTransaction(async (transaction) => {
        const [message, receipt] = await Promise.all([
          transaction.get(messageReference),
          transaction.get(receiptReference),
        ]);
        if (!message.exists) throw new MissingMessageError();
        if (receipt.exists) return;

        transaction.create(receiptReference, {
          userId,
          readAt: FieldValue.serverTimestamp(),
        });
      });
      const storedReceipt = await receiptReference.get();
      const readAt = storedReceipt.get('readAt');
      if (!(readAt instanceof Timestamp)) {
        throw new MessageStoreError('Stored read receipt has no committed Firestore timestamp');
      }
      return { readAt: readAt.toDate().toISOString() };
    } catch (error) {
      if (error instanceof MissingMessageError || error instanceof MessageStoreError) throw error;
      throw new MessageStoreError('Failed to store read receipt in Firestore', { cause: error });
    }
  }

  async updateLastSeen(
    chatId: string,
    messageId: string,
    userId: string,
  ): Promise<{ lastSeenMessageId: string; lastSeenAt: string; updated: boolean }> {
    try {
      const database = getDatabase();
      const messages = database.collection('chats').doc(chatId).collection('messages');
      const messageReference = messages.doc(messageId);
      const stateReference = database
        .collection('chats')
        .doc(chatId)
        .collection('lastSeen')
        .doc(firestoreUserKey(userId));

      const transactionResult = await database.runTransaction(async (transaction) => {
        const [message, state] = await Promise.all([
          transaction.get(messageReference),
          transaction.get(stateReference),
        ]);
        if (!message.exists) throw new MissingMessageError();

        const candidateTimestamp = message.get('createdAt');
        if (!(candidateTimestamp instanceof Timestamp)) {
          throw new MessageStoreError('Stored message has no committed Firestore timestamp');
        }

        if (state.exists) {
          const currentId = state.get('lastSeenMessageId');
          const currentTimestamp =
            typeof currentId === 'string'
              ? (await transaction.get(messages.doc(currentId))).get('createdAt')
              : undefined;
          if (!(currentTimestamp instanceof Timestamp)) {
            throw new MessageStoreError('Stored last-seen message has no valid timestamp');
          }
          const comparison = compareTimestampAndId(
            candidateTimestamp,
            messageId,
            currentTimestamp,
            currentId as string,
          );
          if (comparison <= 0) {
            return {
              lastSeenMessageId: currentId as string,
              updated: false,
            };
          }
        }

        transaction.set(stateReference, {
          lastSeenMessageId: messageId,
          lastSeenAt: FieldValue.serverTimestamp(),
        });
        return { lastSeenMessageId: messageId, updated: true };
      });
      const storedState = await stateReference.get();
      const lastSeenAt = storedState.get('lastSeenAt');
      const lastSeenMessageId = storedState.get('lastSeenMessageId');
      if (!(lastSeenAt instanceof Timestamp) || typeof lastSeenMessageId !== 'string') {
        throw new MessageStoreError('Stored last-seen state has no committed Firestore timestamp');
      }
      return {
        lastSeenMessageId,
        lastSeenAt: lastSeenAt.toDate().toISOString(),
        updated: transactionResult.updated,
      };
    } catch (error) {
      if (error instanceof MissingMessageError || error instanceof MessageStoreError) throw error;
      throw new MessageStoreError('Failed to update last-seen state in Firestore', {
        cause: error,
      });
    }
  }
}

export class MissingMessageError extends Error {
  constructor() {
    super('Message not found in this chat');
    this.name = 'MissingMessageError';
  }
}

function compareTimestampAndId(
  candidateTimestamp: Timestamp,
  candidateId: string,
  currentTimestamp: Timestamp,
  currentId: string,
): number {
  const secondsComparison = candidateTimestamp.seconds - currentTimestamp.seconds;
  if (secondsComparison !== 0) return secondsComparison;
  const nanosComparison = candidateTimestamp.nanoseconds - currentTimestamp.nanoseconds;
  if (nanosComparison !== 0) return nanosComparison;
  return candidateId.localeCompare(currentId);
}

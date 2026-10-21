import { z } from 'zod';

export const createChatBodySchema = z
  .object({
    userAId: z.string().min(1),
    userBId: z.string().min(1),
  })
  .strict()
  .refine((body) => body.userAId !== body.userBId, {
    message: 'userAId and userBId must be different',
    path: ['userBId'],
  });

export const userIdParamsSchema = z.object({ userId: z.string().min(1) });

const chatIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const chatIdParamsSchema = z.object({ chatId: chatIdSchema });

export const chatMessageParamsSchema = z.object({
  chatId: chatIdSchema,
  messageId: z.string().min(1).max(1500),
});

export const sendMessageBodySchema = z
  .object({
    senderId: z.string().min(1),
    text: z.string().trim().min(1, 'Message text cannot be empty').max(4000),
  })
  .strict();

export const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
});

export const readReceiptBodySchema = z.object({ userId: z.string().min(1) }).strict();

export const lastSeenBodySchema = z
  .object({ userId: z.string().min(1), messageId: z.string().min(1).max(1500) })
  .strict();

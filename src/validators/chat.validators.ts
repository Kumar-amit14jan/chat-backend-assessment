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

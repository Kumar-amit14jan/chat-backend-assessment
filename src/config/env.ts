import 'dotenv/config';
import { z } from 'zod';

const optionalEnvString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    FIREBASE_PROJECT_ID: optionalEnvString,
    FIREBASE_CLIENT_EMAIL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().email().optional(),
    ),
    FIREBASE_PRIVATE_KEY: optionalEnvString,
  })
  .superRefine((env, context) => {
    const firebaseValues = [
      env.FIREBASE_PROJECT_ID,
      env.FIREBASE_CLIENT_EMAIL,
      env.FIREBASE_PRIVATE_KEY,
    ];
    const providedCount = firebaseValues.filter(Boolean).length;

    if (providedCount !== 0 && providedCount !== firebaseValues.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide all Firebase service-account values or leave all of them blank',
        path: ['FIREBASE_PROJECT_ID'],
      });
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsedEnv.data;

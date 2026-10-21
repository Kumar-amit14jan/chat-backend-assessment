import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { env } from './env';

function initializeFirebase(): App | null {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    console.info('Firebase Admin is not configured; skipping initialization.');
    return null;
  }

  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  return initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

export const firebaseApp = initializeFirebase();

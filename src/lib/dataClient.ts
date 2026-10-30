import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const serviceConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};
export const serviceConfigured = Boolean(serviceConfig.apiKey && serviceConfig.authDomain && serviceConfig.projectId && serviceConfig.appId);
const app = serviceConfigured ? (getApps()[0] || initializeApp(serviceConfig)) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;


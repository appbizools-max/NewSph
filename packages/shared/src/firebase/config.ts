import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, signOut, initializeAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, Firestore } from 'firebase/firestore';
import { FirebaseConfigOptions } from '../types';
import { getRNAuthPersistence } from './persistence';

// Safe environment variable retriever for Hermes & Web
function getEnvVar(key: string): string | undefined {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) { }
  return undefined;
}

// Live Firebase Configuration for Spiritual Homeo
const defaultConfig: FirebaseConfigOptions & { databaseURL?: string } = {
  apiKey: getEnvVar('EXPO_PUBLIC_FIREBASE_API_KEY') || getEnvVar('VITE_FIREBASE_API_KEY') || "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: getEnvVar('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') || getEnvVar('VITE_FIREBASE_AUTH_DOMAIN') || "spiritual-homeopathy-3b552.firebaseapp.com",
  databaseURL: "https://spiritual-homeopathy-3b552-default-rtdb.firebaseio.com",
  projectId: getEnvVar('EXPO_PUBLIC_FIREBASE_PROJECT_ID') || getEnvVar('VITE_FIREBASE_PROJECT_ID') || "spiritual-homeopathy-3b552",
  storageBucket: getEnvVar('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') || getEnvVar('VITE_FIREBASE_STORAGE_BUCKET') || "spiritual-homeopathy-3b552.firebasestorage.app",
  messagingSenderId: getEnvVar('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') || getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID') || "81822616559",
  appId: getEnvVar('EXPO_PUBLIC_FIREBASE_APP_ID') || getEnvVar('VITE_FIREBASE_APP_ID') || "1:81822616559:web:98a0b9cd974938cc87841a",
  measurementId: "G-SWSZ49BB14"
};

let app: FirebaseApp = null as any;
let auth: Auth = null as any;
let db: Firestore = null as any;

export function initFirebase(customConfig?: FirebaseConfigOptions) {
  try {
    const config = customConfig || defaultConfig;
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }
    if (app) {
      const rnPersistence = getRNAuthPersistence();
      if (rnPersistence) {
        try {
          auth = initializeAuth(app, { persistence: rnPersistence });
        } catch (e) {
          auth = getAuth(app);
        }
      } else {
        auth = getAuth(app);
      }
      try {
        db = initializeFirestore(app, {
          experimentalAutoDetectLongPolling: true,
        });
      } catch {
        db = getFirestore(app);
      }
    }
    return { app, auth, db };
  } catch (err) {
    console.warn('Firebase initialization deferred:', err);
    return { app: null, auth: null, db: null };
  }
}

export async function signOutUser() {
  try {
    if (auth) {
      await signOut(auth);
    }
  } catch (err) {
    console.warn('Sign out notice:', err);
  }
}

// Auto-initialize safely on module load
try {
  initFirebase();
} catch (err) {
  console.warn('Firebase auto-init notice:', err);
}

export { app, auth, db };

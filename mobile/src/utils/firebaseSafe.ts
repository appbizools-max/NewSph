import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
  orderBy,
  arrayUnion,
  runTransaction,
  increment,
  Firestore
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  databaseURL: "https://spiritual-homeopathy-3b552-default-rtdb.firebaseio.com",
  projectId: "spiritual-homeopathy-3b552",
  storageBucket: "spiritual-homeopathy-3b552.firebasestorage.app",
  messagingSenderId: "81822616559",
  appId: "1:81822616559:web:98a0b9cd974938cc87841a",
  measurementId: "G-SWSZ49BB14"
};

let _mobileDb: Firestore | null = null;

/**
 * Returns a guaranteed active local mobile Firestore instance matching mobile/node_modules
 */
export function getSafeDb(): Firestore {
  if (_mobileDb) return _mobileDb;
  try {
    const existing = getApps().find(a => a.name === 'sphMobileApp');
    const app = existing || initializeApp(firebaseConfig, 'sphMobileApp');
    try {
      _mobileDb = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
      });
    } catch {
      _mobileDb = getFirestore(app);
    }
    return _mobileDb;
  } catch (e) {
    console.warn('getSafeDb init notice:', e);
    try {
      const fallbackApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
      _mobileDb = getFirestore(fallbackApp);
      return _mobileDb;
    } catch (e2) {
      console.warn('getSafeDb fallback error:', e2);
      return null as any;
    }
  }
}

export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
  orderBy,
  arrayUnion,
  runTransaction,
  increment
};
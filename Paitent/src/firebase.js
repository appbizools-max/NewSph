import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getStorage } from "firebase/storage";


export const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
  storageBucket: "spiritual-homeopathy-3b552.firebasestorage.app",
  messagingSenderId: "81822616559",
  appId: "1:81822616559:web:98a0b9cd974938cc87841a",
  measurementId: "G-SWSZ49BB14"
};

const apps = getApps();
const isFirstLoad = apps.length === 0;
const app = isFirstLoad ? initializeApp(firebaseConfig) : getApp();

let authInstance;
if (!isFirstLoad) {
  authInstance = getAuth(app);
} else {
  try {
    const persistence = typeof getReactNativePersistence === 'function'
      ? getReactNativePersistence(ReactNativeAsyncStorage)
      : undefined;
      
    authInstance = initializeAuth(app, persistence ? { persistence } : undefined);
  } catch (error) {
    if (error.code === 'auth/already-initialized' || error.message?.includes('already-initialized')) {
      authInstance = getAuth(app);
    } else {
      throw error;
    }
  }
}

export const auth = authInstance;
if (auth && auth.settings) {
  auth.settings.appVerificationDisabledForTesting = true;
}
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({})
  });
} catch (error) {
  dbInstance = getFirestore(app);
}
export const db = dbInstance;
export const storage = getStorage(app);

export default app;

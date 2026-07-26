import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { 
  initializeFirestore,
  getFirestore, 
  persistentLocalCache,
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : (firebaseConfig ? initializeApp(firebaseConfig) : null);

let firestoreDb = null;
if (app) {
  try {
    const dbId = firebaseConfig?.firestoreDatabaseId;
    firestoreDb = initializeFirestore(app, {
      localCache: persistentLocalCache({})
    }, dbId);
  } catch {
    firestoreDb = firebaseConfig?.firestoreDatabaseId 
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId) 
      : getFirestore(app);
  }
}

export const db = firestoreDb;

export const auth = app ? getAuth(app) : null;

export {
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  doc,
  setDoc,
  getDoc,
  onSnapshot
};
export type { User };


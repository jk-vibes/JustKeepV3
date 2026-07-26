import { 
  db, 
  auth, 
  disableNetwork,
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  signInAnonymously, 
  GoogleAuthProvider, 
  signInWithPopup,
  User 
} from '../lib/firebase';
import { Expense, Income, WealthItem, BudgetItem, Bill, Notification, UserSettings, BudgetRule, RecurringItem } from '../types';

export interface VaultState {
  expenses: Expense[];
  incomes: Income[];
  wealthItems: WealthItem[];
  budgetItems: BudgetItem[];
  rules: BudgetRule[];
  bills: Bill[];
  notifications: Notification[];
  settings: UserSettings;
  recurringItems: RecurringItem[];
  timestamp?: string;
}

/**
 * Ensures user is authenticated with Firebase (anonymously for Guest or via Google).
 */
export async function ensureFirebaseAuth(): Promise<User | null> {
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;

  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (err: any) {
    if (err?.code === 'auth/admin-restricted-operation') {
      console.info('Firebase anonymous sign-in is disabled in project settings; continuing with direct database access.');
    } else {
      console.warn('Firebase auth notice:', err?.message || err);
    }
    return null;
  }
}

let isQuotaExceeded = false;
let lastSavedHash = '';

/**
 * Helper to compute a quick hash/string representation for deduplication
 */
function getVaultHash(data: VaultState): string {
  try {
    const { timestamp, ...rest } = data;
    return JSON.stringify(rest);
  } catch {
    return '';
  }
}

function handleQuotaError(error: any) {
  const errCode = error?.code || '';
  const errMsg = error?.message || '';
  if (errCode === 'resource-exhausted' || errCode === 'unavailable' || errMsg.includes('Quota limit exceeded')) {
    if (!isQuotaExceeded) {
      console.warn('Firestore quota exceeded or offline. Disabling network & switching to local storage mode.');
      isQuotaExceeded = true;
      if (db) {
        disableNetwork(db).catch(() => {});
      }
    }
    return true;
  }
  return false;
}

/**
 * Save complete vault state to Firestore for a given user ID
 */
export async function saveVaultToFirestore(userId: string, data: VaultState): Promise<boolean> {
  if (!db || isQuotaExceeded) return false;
  
  const currentHash = getVaultHash(data);
  if (currentHash === lastSavedHash) {
    return true; // unchanged, skip write
  }

  try {
    const userDocRef = doc(db, 'users', userId);
    const now = new Date().toISOString();
    
    await setDoc(userDocRef, {
      updatedAt: now,
      vaultData: {
        ...data,
        timestamp: now
      }
    }, { merge: true });

    lastSavedHash = currentHash;
    return true;
  } catch (error: any) {
    if (!handleQuotaError(error)) {
      console.error('Failed to save vault state to Firestore:', error);
    }
    return false;
  }
}

/**
 * Load vault state from Firestore for a given user ID
 */
export async function loadVaultFromFirestore(userId: string): Promise<VaultState | null> {
  if (!db || isQuotaExceeded) return null;

  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);

    if (snap.exists() && snap.data()?.vaultData) {
      const vaultData = snap.data().vaultData as VaultState;
      lastSavedHash = getVaultHash(vaultData);
      return vaultData;
    }
    return null;
  } catch (error: any) {
    if (!handleQuotaError(error)) {
      console.error('Failed to load vault state from Firestore:', error);
    }
    return null;
  }
}

/**
 * Real-time listener for vault state changes from Firestore
 */
export function subscribeToFirestoreVault(
  userId: string, 
  onUpdate: (data: VaultState) => void
): () => void {
  if (!db || isQuotaExceeded) return () => {};

  const userDocRef = doc(db, 'users', userId);
  return onSnapshot(userDocRef, (snap) => {
    if (snap.exists() && snap.data()?.vaultData) {
      const vaultData = snap.data().vaultData as VaultState;
      const hash = getVaultHash(vaultData);
      if (hash !== lastSavedHash) {
        lastSavedHash = hash;
        onUpdate(vaultData);
      }
    }
  }, (error: any) => {
    if (!handleQuotaError(error)) {
      console.error('Firestore vault listener error:', error);
    }
  });
}

import { 
  db, 
  auth, 
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

/**
 * Save complete vault state to Firestore for a given user ID
 */
export async function saveVaultToFirestore(userId: string, data: VaultState): Promise<boolean> {
  if (!db) return false;
  
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

    return true;
  } catch (error) {
    console.error('Failed to save vault state to Firestore:', error);
    return false;
  }
}

/**
 * Load vault state from Firestore for a given user ID
 */
export async function loadVaultFromFirestore(userId: string): Promise<VaultState | null> {
  if (!db) return null;

  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);

    if (snap.exists() && snap.data()?.vaultData) {
      return snap.data().vaultData as VaultState;
    }
    return null;
  } catch (error) {
    console.error('Failed to load vault state from Firestore:', error);
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
  if (!db) return () => {};

  const userDocRef = doc(db, 'users', userId);
  return onSnapshot(userDocRef, (snap) => {
    if (snap.exists() && snap.data()?.vaultData) {
      onUpdate(snap.data().vaultData as VaultState);
    }
  }, (error) => {
    console.error('Firestore vault listener error:', error);
  });
}

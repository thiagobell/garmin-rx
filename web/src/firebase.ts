import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  deleteUser,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  type Firestore,
} from 'firebase/firestore';

import type {
  AccessConfigDoc,
  DayLogDoc,
  DaySummaryDoc,
  IntradayDetailsDoc,
  PrivateNoteDoc,
  RegimenEraDoc,
} from './types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.error('Firebase initialization error:', err);
  }
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function purgeUnauthorizedUser(user: User): Promise<void> {
  try {
    await deleteUser(user);
  } catch {
    // Ignore if token is too old for deleteUser; signOut below still terminates session
  }
  if (auth) {
    await fbSignOut(auth);
  }
}

export async function verifyAndGetAccessConfig(user: User): Promise<AccessConfigDoc> {
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  try {
    const snap = await getDoc(doc(db, 'config', 'access'));
    if (!snap.exists()) {
      throw new Error('Access configuration not found.');
    }
    const cfg = snap.data() as AccessConfigDoc;
    const email = (user.email || '').toLowerCase();
    const owner = (cfg.ownerEmail || '').toLowerCase();
    const allowed = (cfg.allowedViewerEmails || []).map((e) => e.toLowerCase());
    if (email !== owner && !allowed.includes(email)) {
      await purgeUnauthorizedUser(user);
      throw new Error(
        `Access denied: "${user.email}" is not on the guest list. Only the owner and invited guest emails may sign in.`
      );
    }
    return cfg;
  } catch (err) {
    await purgeUnauthorizedUser(user);
    if (err instanceof Error && err.message.startsWith('Access denied:')) {
      throw err;
    }
    throw new Error(
      `Access denied: "${user.email || 'Account'}" is not authorized to view this dashboard.`
    );
  }
}

export async function signInWithGoogle(): Promise<User | null> {
  if (!auth) {
    throw new Error(
      'Firebase env vars (VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID) are not configured yet.'
    );
  }
  const result = await signInWithPopup(auth, googleProvider);
  await verifyAndGetAccessConfig(result.user);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await fbSignOut(auth);
}

export function subscribeToAuthChanges(
  callback: (user: User | null, errorMsg?: string) => void
): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    try {
      await verifyAndGetAccessConfig(user);
      callback(user);
    } catch (err) {
      callback(
        null,
        err instanceof Error ? err.message : 'Unauthorized Google account.'
      );
    }
  });
}

/**
 * Fetch `config/access` document
 */
export async function fetchAccessConfig(): Promise<AccessConfigDoc | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'config', 'access'));
  return snap.exists() ? (snap.data() as AccessConfigDoc) : null;
}

/**
 * Save `config/access` document (Owner only)
 */
export async function saveAccessConfig(config: AccessConfigDoc): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'config', 'access'), config, { merge: true });
}

/**
 * Fetch all `days/{date}` summary documents ordered chronologically
 */
export async function fetchAllDaySummaries(): Promise<DaySummaryDoc[]> {
  if (!db) return [];
  const q = query(collection(db, 'days'), orderBy('calendarDate', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as DaySummaryDoc);
}

/**
 * Fetch single-day high-resolution `days/{date}/intraday/details` on demand
 */
export async function fetchIntradayDetails(calendarDate: string): Promise<IntradayDetailsDoc | null> {
  if (!db) return null;
  const ref = doc(db, 'days', calendarDate, 'intraday', 'details');
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as IntradayDetailsDoc) : null;
}

/**
 * Fetch all `day_logs/{date}` documents
 */
export async function fetchAllDayLogs(): Promise<Record<string, DayLogDoc>> {
  if (!db) return {};
  const snap = await getDocs(collection(db, 'day_logs'));
  const map: Record<string, DayLogDoc> = {};
  snap.forEach((d) => {
    const data = d.data() as DayLogDoc;
    map[data.calendarDate || d.id] = data;
  });
  return map;
}

/**
 * Save a `day_logs/{date}` document (Owner only)
 */
export async function saveDayLog(dayLog: DayLogDoc): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'day_logs', dayLog.calendarDate), dayLog);
}

/**
 * Fetch `private_notes/{date}` (Strictly Owner only — never call when in Doctor role)
 */
export async function fetchPrivateNote(calendarDate: string): Promise<PrivateNoteDoc | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'private_notes', calendarDate));
  return snap.exists() ? (snap.data() as PrivateNoteDoc) : null;
}

/**
 * Save `private_notes/{date}` (Strictly Owner only)
 */
export async function savePrivateNote(noteDoc: PrivateNoteDoc): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'private_notes', noteDoc.calendarDate), noteDoc);
}

/**
 * Fetch all `regimen_eras/{id}` documents ordered by startDate
 */
export async function fetchRegimenEras(): Promise<RegimenEraDoc[]> {
  if (!db) return [];
  const q = query(collection(db, 'regimen_eras'), orderBy('startDate', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as RegimenEraDoc);
}

/**
 * Save or update a `regimen_eras/{id}` document (Owner only)
 */
export async function saveRegimenEra(era: RegimenEraDoc): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'regimen_eras', era.id), era);
}

/**
 * Delete a `regimen_eras/{id}` document (Owner only)
 */
export async function deleteRegimenEra(eraId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, 'regimen_eras', eraId));
}

/**
 * Trigger the Cloud Function `syncGarminNow` to pull Yesterday + Today from Garmin Connect API
 */
export async function triggerSyncGarminNow(): Promise<{
  syncedDates?: string[];
  message?: string;
}> {
  if (!app) {
    // Demo fallback simulation
    await new Promise((r) => setTimeout(r, 900));
    return {
      syncedDates: ['2026-10-20', '2026-10-21'],
      message: 'Simulated Garmin sync (configure VITE_FIREBASE_* env vars for live Cloud Function)',
    };
  }
  // The Functions SDK is loaded on demand so the lightweight /quick page
  // (and first dashboard paint) never download it until "Sync Garmin" is used.
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
  const functions = getFunctions(app, region);
  const callable = httpsCallable<Record<string, never>, { syncedDates?: string[]; message?: string }>(
    functions,
    'syncGarminNow'
  );
  const res = await callable({});
  return res.data;
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Lock, LogOut, ShieldCheck } from 'lucide-react';
import {
  fetchAccessConfig,
  fetchAllDayLogs,
  fetchAllDaySummaries,
  fetchPrivateNote,
  isFirebaseConfigured,
  saveDayLog,
  savePrivateNote,
  signInWithGoogle,
  signOutUser,
  subscribeToAuthChanges,
} from './firebase';
import { DEFAULT_ACCESS_CONFIG } from './demoData';
import type {
  AccessConfigDoc,
  DayLogDoc,
  DaySummaryDoc,
  PrivateNoteDoc,
  UserRole,
} from './types';
import { useI18n } from './i18n';
import { browserTodayISO, watchNowHHMM, watchTodayISO } from './utils/watchTime';
import { QuickLogDrawer } from './components/QuickLogDrawer';

/**
 * Standalone lightweight page served at `/quick` (multi-entry Vite build).
 *
 * Purpose: a 1-tap home-screen entry point for logging doses, caffeine,
 * symptoms and daily notes without loading the full dashboard bundle
 * (no charts, no recharts). Reuses the exact same QuickLogDrawer component
 * as the dashboard so the logging UI never diverges.
 */
export const QuickAddPage: React.FC = () => {
  const { t } = useI18n();

  // Auth state (mirrors App.tsx)
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessConfig, setAccessConfig] = useState<AccessConfigDoc>(DEFAULT_ACCESS_CONFIG);

  // Minimal data state — only what the Quick Log drawer needs
  const [allDays, setAllDays] = useState<DaySummaryDoc[]>([]);
  const [dayLogs, setDayLogs] = useState<Record<string, DayLogDoc>>({});
  const [privateNote, setPrivateNote] = useState<PrivateNoteDoc | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);

  // Owner check — identical role logic to App.tsx (guests only get read access)
  const role: UserRole = useMemo(() => {
    if (!userEmail) return 'guest';
    const clean = userEmail.toLowerCase();
    const ownerEmail = (
      accessConfig.ownerEmail ||
      import.meta.env.VITE_OWNER_EMAIL ||
      ''
    ).toLowerCase();
    return ownerEmail && clean === ownerEmail ? 'owner' : 'guest';
  }, [userEmail, accessConfig]);
  const isOwner = role === 'owner';

  // Watch-local "today" + "now" for the drawer (same golden rule as the dashboard)
  const selectedDate = useMemo(
    () => (allDays.length > 0 ? watchTodayISO(allDays) : browserTodayISO()),
    [allDays]
  );
  const nowHHMM = useMemo(() => watchNowHHMM(allDays), [allDays]);

  const loadFirestoreCollections = useCallback(async () => {
    if (!isFirebaseConfigured) return;
    setIsLoadingData(true);
    setAuthError(null);
    try {
      const [cfg, summaries, logs] = await Promise.all([
        fetchAccessConfig(),
        fetchAllDaySummaries(),
        fetchAllDayLogs(),
      ]);
      if (cfg) setAccessConfig(cfg);
      setAllDays(summaries);
      setDayLogs(logs);
      const today = summaries.length > 0 ? watchTodayISO(summaries) : browserTodayISO();
      setPrivateNote(await fetchPrivateNote(today));
    } catch (err) {
      console.error('QuickAdd: failed to load Firestore collections:', err);
      setAuthError(err instanceof Error ? err.message : t('unauthorizedTitle'));
    } finally {
      setIsLoadingData(false);
    }
  }, [t]);

  // Auth subscription — unauthorized emails are purged client-side by firebase.ts
  useEffect(() => {
    const unsub = subscribeToAuthChanges((u, errorMsg) => {
      setUserEmail(u?.email ?? null);
      setAuthReady(true);
      if (errorMsg) setAuthError(errorMsg);
      if (u) {
        loadFirestoreCollections();
      } else {
        setAllDays([]);
        setDayLogs({});
        setPrivateNote(null);
      }
    });
    return unsub;
  }, [loadFirestoreCollections]);

  const handleSaveDayLog = async (updatedLog: DayLogDoc) => {
    setDayLogs((prev) => ({ ...prev, [updatedLog.calendarDate]: updatedLog }));
    await saveDayLog(updatedLog);
  };

  const handleSavePrivateNote = async (updatedNote: PrivateNoteDoc) => {
    setPrivateNote(updatedNote);
    await savePrivateNote(updatedNote);
  };

  // The drawer's close (X) button navigates to the full dashboard
  const goToDashboard = () => {
    window.location.href = '/';
  };

  const handleSignIn = () => {
    signInWithGoogle().catch((e) => setAuthError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <main className="flex-1">
        {!authReady ? (
          <div className="flex flex-col items-center justify-center min-h-screen text-slate-500 gap-3">
            <Activity className="w-8 h-8 text-blue-500 animate-pulse" />
            <p className="text-sm">{t('checkingSession')}</p>
          </div>
        ) : !userEmail ? (
          <div className="max-w-md mx-auto my-20 bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('quickAddTitle')}</h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">{t('quickAddDesc')}</p>
            {isFirebaseConfigured ? (
              <button
                type="button"
                onClick={handleSignIn}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                {t('signIn')}
              </button>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                {t('firebaseNotConfigured')}
              </p>
            )}
            {authError && (
              <p className="mt-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                {authError}
              </p>
            )}
          </div>
        ) : !isOwner && !isLoadingData ? (
          <div className="max-w-lg mx-auto my-20 bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center">
            <h3 className="text-sm font-semibold text-rose-800 mb-2">{t('quickAddOwnerOnly')}</h3>
            <p className="text-xs text-rose-700 mb-4">{authError ?? t('unauthorizedHint', { email: userEmail })}</p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={goToDashboard}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition cursor-pointer"
              >
                {t('openDashboard')}
              </button>
              <button
                type="button"
                onClick={() => signOutUser().catch(console.error)}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-500 text-xs font-medium hover:bg-slate-100 transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                {t('signOut')}
              </button>
            </div>
          </div>
        ) : isLoadingData && allDays.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-slate-500 gap-3">
            <Activity className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm">{t('loadingData')}</p>
          </div>
        ) : (
          <QuickLogDrawer
            isOpen
            onClose={goToDashboard}
            calendarDate={selectedDate}
            nowHHMM={nowHHMM}
            dayLog={dayLogs[selectedDate]}
            privateNote={privateNote}
            defaultMedicationName={accessConfig.medicationSettings?.defaultMedicationName}
            dosePresets={accessConfig.medicationSettings?.customDosePresets}
            onSaveDayLog={handleSaveDayLog}
            onSavePrivateNote={handleSavePrivateNote}
          />
        )}
      </main>
    </div>
  );
};

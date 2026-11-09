import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, Lock, ShieldCheck, X } from 'lucide-react';
import {
  deleteRegimenEra,
  fetchAccessConfig,
  fetchAllDayLogs,
  fetchAllDaySummaries,
  fetchIntradayDetails,
  fetchPrivateNote,
  fetchRegimenEras,
  isFirebaseConfigured,
  saveAccessConfig,
  saveDayLog,
  savePrivateNote,
  saveRegimenEra,
  signInWithGoogle,
  signOutUser,
  subscribeToAuthChanges,
  triggerSyncGarminNow,
} from './firebase';
import { DEFAULT_ACCESS_CONFIG } from './demoData';
import type {
  AccessConfigDoc,
  DashboardTab,
  DayLogDoc,
  DaySummaryDoc,
  IntradayDetailsDoc,
  PrivateNoteDoc,
  RegimenEraDoc,
  UserRole,
} from './types';
import { useI18n } from './i18n';
import { browserTodayISO, watchNowHHMM, watchTodayISO } from './utils/watchTime';
import { formatDateDDMMYYYY } from './utils/format';
import { Header } from './components/Header';
import { DayExplorer } from './components/DayExplorer';
import { CarpetHeatmap } from './components/CarpetHeatmap';
import { LongitudinalSafety } from './components/LongitudinalSafety';
import { RegimenComparison } from './components/RegimenComparison';
import { QuickLogDrawer } from './components/QuickLogDrawer';
import { AccessSettingsModal } from './components/AccessSettingsModal';

/** Synthetic empty day used when the owner selects Today before the scheduled Garmin sync has run. */
function makePendingDay(calendarDate: string, timezoneOffsetHours: number): DaySummaryDoc {
  return {
    calendarDate,
    updatedAtUTC: new Date().toISOString(),
    timezoneOffsetHours,
    hourlyHrLocal: Array(24).fill(null),
    hourlySeatedHrLocal: Array(24).fill(null),
    restingHr: null,
    asleepBaselineHr: null,
    daytimeRawHr: null,
    daytimeSeatedHr: null,
    eveningHr: null,
    minHr: null,
    maxHr: null,
    abnormalHrAlertsCount: 0,
    hrvNightAvg: null,
    hrvWeeklyAvg: null,
    hrv5MinHigh: null,
    hrvStatus: null,
    hrvBaseline: null,
    earlyNightHrvAvg: null,
    lateNightHrvAvg: null,
    sleepStartLocal: null,
    sleepEndLocal: null,
    sleepDurationSec: null,
    deepSleepSec: null,
    lightSleepSec: null,
    remSleepSec: null,
    awakeSleepSec: null,
    sleepStressAvg: null,
    sleepScore: null,
    sleepAvgHr: null,
    sleepRespirationAvg: null,
    sleepSpo2Avg: null,
    stressAvg: null,
    stressMax: null,
    restStressPct: null,
    lowStressPct: null,
    mediumStressPct: null,
    highStressPct: null,
    bodyBatteryCharged: null,
    bodyBatteryDrained: null,
    bodyBatteryHigh: null,
    bodyBatteryLow: null,
    steps: null,
    activeCalories: null,
    wakingRespirationAvg: null,
    spo2Avg: null,
    workouts: [],
    flags: {
      deltaHrExceeds20: false,
      deltaSeatedHrBpm: null,
      lateDoseCarryoverWarning: false,
      overnightHrvSuppressionPct: null,
      hasAbnormalHrAlert: false,
    },
  };
}

const AppInner: React.FC = () => {
  const { t } = useI18n();

  // Auth & Role state
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessConfig, setAccessConfig] = useState<AccessConfigDoc>(DEFAULT_ACCESS_CONFIG);
  const [isPreviewingGuestView, setIsPreviewingGuestView] = useState<boolean>(false);

  // Real data state (strictly from Firestore — no synthetic demo data)
  const [allDays, setAllDays] = useState<DaySummaryDoc[]>([]);
  const [dayLogs, setDayLogs] = useState<Record<string, DayLogDoc>>({});
  const [privateNotes, setPrivateNotes] = useState<Record<string, PrivateNoteDoc>>({});
  const [regimenEras, setRegimenEras] = useState<RegimenEraDoc[]>([]);
  const [intradayCache, setIntradayCache] = useState<Record<string, IntradayDetailsDoc>>({});

  // UI Navigation state — default to the local "today" so logging works before the sync runs
  const [activeTab, setActiveTab] = useState<DashboardTab>('day-explorer');
  const [selectedDate, setSelectedDate] = useState<string>(browserTodayISO);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState<boolean>(false);
  const [quickLogPrefillTime, setQuickLogPrefillTime] = useState<string | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusBanner, setSyncStatusBanner] = useState<string | undefined>(undefined);

  // Determine effective role: Owner or read-only Guest (unauthorized emails are signed out client-side)
  const role: UserRole = useMemo(() => {
    if (!userEmail) return 'guest';
    const clean = userEmail.toLowerCase();
    const ownerEmail = (
      accessConfig.ownerEmail ||
      import.meta.env.VITE_OWNER_EMAIL ||
      ''
    ).toLowerCase();
    if (ownerEmail && clean === ownerEmail) return 'owner';
    return 'guest';
  }, [userEmail, accessConfig]);

  const effectiveIsOwner = role === 'owner' && !isPreviewingGuestView;

  /**
   * Watch-local "today" derived from the latest synced day's watch-recorded offset.
   * This is the same regardless of the viewer's timezone (owner or a guest doctor
   * 12 hours away) and is selectable for logging even before the scheduled Garmin
   * sync (10:00 & 22:00 watch time) creates the day's Firestore document.
   */
  const watchToday = useMemo(() => watchTodayISO(allDays), [allDays]);
  const latestWatchOffset = useMemo(
    () =>
      allDays.length > 0 && typeof allDays[allDays.length - 1].timezoneOffsetHours === 'number'
        ? allDays[allDays.length - 1].timezoneOffsetHours
        : 0,
    [allDays]
  );

  // Support mobile PWA 1-tap launch (`/?quicklog=1`)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('quicklog') === '1') {
      setIsQuickLogOpen(true);
    }
  }, []);

  // Load Firestore collections when authenticated
  const loadFirestoreCollections = useCallback(async () => {
    if (!isFirebaseConfigured) return;
    setIsLoadingData(true);
    setAuthError(null);
    try {
      const [cfg, summaries, logs, eras] = await Promise.all([
        fetchAccessConfig(),
        fetchAllDaySummaries(),
        fetchAllDayLogs(),
        fetchRegimenEras(),
      ]);
      if (cfg) {
        setAccessConfig(cfg);
        if (cfg.lastGarminSyncStatus) setSyncStatusBanner(cfg.lastGarminSyncStatus);
      }
      setAllDays(summaries);
      if (summaries.length > 0) {
        // Keep "Today" selected even if the day is not synced yet (e.g. logging at
        // 00:55 before the first scheduled sync of the day); otherwise snap into range.
        const first = summaries[0].calendarDate;
        const last = summaries[summaries.length - 1].calendarDate;
        const maxDate = watchTodayISO(summaries) || last;
        setSelectedDate((prev) =>
          prev >= first && prev <= maxDate ? prev : last
        );
      }
      setDayLogs(logs);
      setRegimenEras(eras);
    } catch (err) {
      console.error('Failed to load Firestore collections:', err);
      setAuthError(
        err instanceof Error
          ? err.message
          : t('unauthorizedTitle')
      );
    } finally {
      setIsLoadingData(false);
    }
  }, [t]);

  useEffect(() => {
    const unsub = subscribeToAuthChanges((u, errorMsg) => {
      setUserEmail(u?.email ?? null);
      setAuthReady(true);
      if (errorMsg) {
        setAuthError(errorMsg);
      }
      if (u) {
        loadFirestoreCollections();
      } else {
        setAllDays([]);
        setDayLogs({});
        setPrivateNotes({});
        setRegimenEras([]);
        setIntradayCache({});
      }
    });
    return unsub;
  }, [loadFirestoreCollections]);

  // Previous synced day (for the previous-evening tail in the Daily View chart)
  const prevDayDate = useMemo(() => {
    const idx = allDays.findIndex((d) => d.calendarDate === selectedDate);
    return idx > 0 ? allDays[idx - 1].calendarDate : undefined;
  }, [allDays, selectedDate]);

  // Fetch single-day intraday details + owner-only private note on demand
  useEffect(() => {
    if (!userEmail || !selectedDate) return;
    let cancelled = false;
    async function loadDayDetails() {
      // Load the selected day plus the previous day (used to draw the tail of
      // the previous evening in the Daily View chart)
      const targets = [selectedDate, prevDayDate].filter(
        (d): d is string => Boolean(d)
      );
      for (const date of targets) {
        if (isFirebaseConfigured && !intradayCache[date]) {
          try {
            const details = await fetchIntradayDetails(date);
            if (!cancelled && details) {
              setIntradayCache((prev) => ({ ...prev, [date]: details }));
            }
          } catch (err) {
            console.error(`Failed to load intraday details for ${date}:`, err);
          }
        }
      }
      if (isFirebaseConfigured && effectiveIsOwner && !privateNotes[selectedDate]) {
        try {
          const pNote = await fetchPrivateNote(selectedDate);
          if (!cancelled && pNote) {
            setPrivateNotes((prev) => ({ ...prev, [selectedDate]: pNote }));
          }
        } catch {
          // ignore if Guest or not found
        }
      }
    }
    loadDayDetails();
    return () => {
      cancelled = true;
    };
  }, [userEmail, selectedDate, prevDayDate, effectiveIsOwner, intradayCache, privateNotes]);

  // Current day: exact match if synced, otherwise a synthetic "pending sync" day
  const syncedCurrentDay = useMemo(
    () => allDays.find((d) => d.calendarDate === selectedDate) ?? null,
    [allDays, selectedDate]
  );
  const hasGarminData = syncedCurrentDay !== null;
  const currentDay: DaySummaryDoc | null = useMemo(
    () => syncedCurrentDay ?? (selectedDate <= watchToday ? makePendingDay(selectedDate, latestWatchOffset) : null),
    [syncedCurrentDay, selectedDate, watchToday, latestWatchOffset]
  );

  const currentIntraday: IntradayDetailsDoc = useMemo(() => {
    if (intradayCache[selectedDate]) return intradayCache[selectedDate];
    return {
      calendarDate: selectedDate,
      hrPoints: [],
      hrvPoints: [],
      bodyBatteryPoints: [],
    };
  }, [intradayCache, selectedDate]);

  // Previous day's intraday details (to render the tail of the previous evening)
  const prevIntraday: IntradayDetailsDoc | undefined = useMemo(
    () => (prevDayDate ? intradayCache[prevDayDate] : undefined),
    [intradayCache, prevDayDate]
  );

  const handleOpenQuickLog = (prefillTime?: string) => {
    if (!effectiveIsOwner) return;
    setQuickLogPrefillTime(prefillTime);
    setIsQuickLogOpen(true);
  };

  const handleSyncGarminNow = async () => {
    if (!effectiveIsOwner) return;
    setIsSyncing(true);
    try {
      const res = await triggerSyncGarminNow();
      const synced = res.syncedDates?.length
        ? res.syncedDates.map((d) => formatDateDDMMYYYY(d, t('present'))).join(' & ')
        : t('present');
      setSyncStatusBanner(res.message || `${t('syncNow')}: ${synced}`);
      await loadFirestoreCollections();
    } catch (err) {
      setSyncStatusBanner(
        err instanceof Error ? `${t('syncError')}: ${err.message}` : t('syncError')
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveDayLog = async (updatedLog: DayLogDoc) => {
    setDayLogs((prev) => ({ ...prev, [updatedLog.calendarDate]: updatedLog }));
    await saveDayLog(updatedLog);
  };

  const handleSavePrivateNote = async (updatedNote: PrivateNoteDoc) => {
    setPrivateNotes((prev) => ({ ...prev, [updatedNote.calendarDate]: updatedNote }));
    await savePrivateNote(updatedNote);
  };

  const handleSaveAccessConfig = async (updated: AccessConfigDoc) => {
    setAccessConfig(updated);
    await saveAccessConfig(updated);
  };

  const handleSaveRegimenEra = async (era: RegimenEraDoc) => {
    setRegimenEras((prev) =>
      [...prev.filter((e) => e.id !== era.id), era].sort((a, b) =>
        a.startDate.localeCompare(b.startDate)
      )
    );
    await saveRegimenEra(era);
  };

  const handleDeleteRegimenEra = async (eraId: string) => {
    setRegimenEras((prev) => prev.filter((e) => e.id !== eraId));
    await deleteRegimenEra(eraId);
  };

  const handleSelectDateAndJump = (date: string) => {
    setSelectedDate(date);
    setActiveTab('day-explorer');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        userEmail={userEmail}
        role={role}
        isPreviewingGuestView={isPreviewingGuestView}
        onToggleGuestPreview={() => setIsPreviewingGuestView((p) => !p)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenQuickLog={handleOpenQuickLog}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSyncGarminNow={handleSyncGarminNow}
        isSyncing={isSyncing}
        onSignIn={() => signInWithGoogle().catch((e) => setAuthError(e.message))}
        onSignOut={() => signOutUser().catch(console.error)}
        isFirebaseConfigured={isFirebaseConfigured}
      />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6">
        {!authReady ? (
          <div className="flex flex-col items-center justify-center py-28 text-slate-500 gap-3">
            <Activity className="w-8 h-8 text-blue-500 animate-pulse" />
            <p className="text-sm">{t('checkingSession')}</p>
          </div>
        ) : !userEmail ? (
          <div className="max-w-md mx-auto my-20 bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              {t('privatePortalTitle')}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              {t('privatePortalDesc')}
            </p>
            {isFirebaseConfigured ? (
              <button
                onClick={() => signInWithGoogle().catch((e) => setAuthError(e.message))}
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
        ) : isLoadingData && allDays.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-slate-500 gap-3">
            <Activity className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm">{t('loadingData')}</p>
          </div>
        ) : authError && allDays.length === 0 ? (
          <div className="max-w-lg mx-auto my-20 bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center">
            <h3 className="text-sm font-semibold text-rose-800 mb-2">
              {t('unauthorizedTitle')}
            </h3>
            <p className="text-xs text-rose-700 mb-4">{authError}</p>
            <p className="text-xs text-slate-500">
              {t('unauthorizedHint', { email: userEmail })}
            </p>
          </div>
        ) : (
          <>
            {/* Slim, dismissible sync status strip (dates pretty-printed as DD/MM/YYYY) */}
            {syncStatusBanner && (
              <div className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {syncStatusBanner.replace(
                      /(\d{4})-(\d{2})-(\d{2})/g,
                      (_m, y: string, m: string, d: string) => `${d}/${m}/${y}`
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSyncStatusBanner(undefined)}
                  className="shrink-0 p-1 rounded-md text-blue-400 hover:text-blue-700 hover:bg-blue-100 cursor-pointer"
                  aria-label={t('closeBtn')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {activeTab === 'day-explorer' && currentDay && (
              <DayExplorer
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                allDays={allDays}
                currentDay={currentDay}
                intraday={currentIntraday}
                prevIntraday={prevIntraday}
                dayLog={dayLogs[selectedDate]}
                prevDayLog={prevDayDate ? dayLogs[prevDayDate] : undefined}
                privateNote={effectiveIsOwner ? privateNotes[selectedDate] : null}
                regimenEras={regimenEras}
                isOwner={effectiveIsOwner}
                onOpenQuickLog={handleOpenQuickLog}
                hasGarminData={hasGarminData}
                watchToday={watchToday}
              />
            )}

            {activeTab === 'carpet-heatmap' && (
              <CarpetHeatmap
                allDays={allDays}
                dayLogs={dayLogs}
                regimenEras={regimenEras}
                selectedDate={selectedDate}
                onSelectDateAndJump={handleSelectDateAndJump}
              />
            )}

            {activeTab === 'longitudinal-safety' && (
              <LongitudinalSafety
                allDays={allDays}
                dayLogs={dayLogs}
                regimenEras={regimenEras}
                onSelectDateAndJump={handleSelectDateAndJump}
              />
            )}

            {activeTab === 'regimen-comparison' && (
              <RegimenComparison
                allDays={allDays}
                dayLogs={dayLogs}
                regimenEras={regimenEras}
                isOwner={effectiveIsOwner}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {/* Owner-Only Quick-Log Drawer */}
      {effectiveIsOwner && (
        <QuickLogDrawer
          isOpen={isQuickLogOpen}
          onClose={() => setIsQuickLogOpen(false)}
          calendarDate={selectedDate}
          prefillTime={quickLogPrefillTime}
          nowHHMM={watchNowHHMM(allDays)}
          dayLog={dayLogs[selectedDate]}
          privateNote={privateNotes[selectedDate]}
          defaultMedicationName={accessConfig.medicationSettings?.defaultMedicationName}
          dosePresets={accessConfig.medicationSettings?.customDosePresets}
          onSaveDayLog={handleSaveDayLog}
          onSavePrivateNote={handleSavePrivateNote}
        />
      )}

      {/* Owner-Only Guest Access & Time Periods Modal */}
      {effectiveIsOwner && (
        <AccessSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          accessConfig={accessConfig}
          regimenEras={regimenEras}
          onSaveAccessConfig={handleSaveAccessConfig}
          onSaveRegimenEra={handleSaveRegimenEra}
          onDeleteRegimenEra={handleDeleteRegimenEra}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => (
  <AppInner />
);

export default App;

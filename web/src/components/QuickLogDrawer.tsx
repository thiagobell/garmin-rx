import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Coffee,
  Lock,
  Pill,
  Plus,
  Save,
  Tag,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type {
  DayLogDoc,
  LoggedEvent,
  MedEventType,
  PrivateNoteDoc,
  SideEffectTag,
} from '../types';
import { formatDateDDMMYYYYWithWeekday } from '../utils/format';
import { translateContextTag, translateSideEffect, useI18n } from '../i18n';

interface QuickLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  calendarDate: string;
  prefillTime?: string;
  /** Current watch-local "HH:MM" — default event time so logging always uses the recording timezone. */
  nowHHMM?: string;
  dayLog?: DayLogDoc;
  privateNote?: PrivateNoteDoc | null;
  defaultMedicationName?: string;
  dosePresets?: number[];
  onSaveDayLog: (updatedLog: DayLogDoc) => Promise<void>;
  onSavePrivateNote: (updatedNote: PrivateNoteDoc) => Promise<void>;
}

const SIDE_EFFECT_IDS: SideEffectTag[] = [
  'peak_focus',
  'crash',
  'palpitations',
  'jittery',
  'headache',
  'anxiety',
  'dry_mouth',
  'appetite_loss',
  'insomnia',
];

const CONTEXT_TAG_OPTIONS = [
  'Workday',
  'Weekend / Off-meds',
  'Exercise',
  'Poor sleep',
  'Travel / Alcohol',
  'High workload',
];

function hhmmToMinute(hhmm: string): number {
  const parts = hhmm.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 540;
  return parts[0] * 60 + parts[1];
}

export const QuickLogDrawer: React.FC<QuickLogDrawerProps> = ({
  isOpen,
  onClose,
  calendarDate,
  prefillTime,
  nowHHMM,
  dayLog,
  privateNote,
  defaultMedicationName,
  dosePresets,
  onSaveDayLog,
  onSavePrivateNote,
}) => {
  const { lang, t } = useI18n();
  const [drawerSection, setDrawerSection] = useState<'events' | 'notes'>('events');
  const [timeLocal, setTimeLocal] = useState<string>('09:00');
  const [activeTab, setActiveTab] = useState<MedEventType>('DOSE');

  // DOSE state — configured strictly in settings
  const configuredMedication = useMemo(() => {
    return defaultMedicationName?.trim() || t('medicationLabel');
  }, [defaultMedicationName, t]);

  const [doseMg, setDoseMg] = useState<number>(10);
  const [releaseType, setReleaseType] = useState<'IR' | 'LA'>('IR');
  const [isCustomDose, setIsCustomDose] = useState<boolean>(false);
  const [customDoseInput, setCustomDoseInput] = useState<string>('');

  const activeDosePresets = useMemo(() => {
    if (dosePresets && dosePresets.length > 0) return dosePresets;
    return [5, 10, 15, 20];
  }, [dosePresets]);

  // CAFFEINE state
  const [caffeinePreset, setCaffeinePreset] = useState<{ label: string; mg: number }>({
    label: 'Espresso (80mg)',
    mg: 80,
  });

  // SIDE_EFFECT state
  const [selectedSideEffects, setSelectedSideEffects] = useState<SideEffectTag[]>(['crash']);
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(2);

  // Optional note on event
  const [publicEventNote, setPublicEventNote] = useState<string>('');

  // Optional Daily Ratings & Tags — NEVER pre-filled unless already saved in dayLog!
  const [focusRating, setFocusRating] = useState<number | null>(
    dayLog?.eodSummary?.focus ?? null
  );
  const [moodRating, setMoodRating] = useState<number | null>(
    dayLog?.eodSummary?.mood ?? null
  );
  const [appetiteRating, setAppetiteRating] = useState<number | null>(
    dayLog?.eodSummary?.appetite ?? null
  );
  const [contextTags, setContextTags] = useState<string[]>(dayLog?.contextTags ?? []);

  // Private Note
  const [privateNoteText, setPrivateNoteText] = useState<string>(privateNote?.note ?? '');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedToast, setSavedToast] = useState<boolean>(false);

  useEffect(() => {
    if (prefillTime) {
      setTimeLocal(prefillTime);
    } else {
      // Default to the current watch-local time (recording timezone), never the viewer's browser time
      setTimeLocal(nowHHMM ?? '09:00');
    }
  }, [prefillTime, nowHHMM, isOpen]);

  useEffect(() => {
    setFocusRating(dayLog?.eodSummary?.focus ?? null);
    setMoodRating(dayLog?.eodSummary?.mood ?? null);
    setAppetiteRating(dayLog?.eodSummary?.appetite ?? null);
    setContextTags(dayLog?.contextTags ?? []);
    setPrivateNoteText(privateNote?.note ?? '');
  }, [dayLog, privateNote, calendarDate, isOpen]);

  if (!isOpen) return null;

  const triggerToast = () => {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1800);
  };

  const toggleSideEffect = (tag: SideEffectTag) => {
    setSelectedSideEffects((prev) =>
      prev.includes(tag) ? prev.filter((s) => s !== tag) : [...prev, tag]
    );
  };

  const toggleContextTag = (tag: string) => {
    setContextTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  // Only saves the newly added event without touching ratings or tags
  const handleAddEvent = async () => {
    setIsSaving(true);
    try {
      const minuteOfDay = hhmmToMinute(timeLocal);
      const newEvent: LoggedEvent = {
        id: `${activeTab.toLowerCase()}-${Date.now()}`,
        timeLocal,
        minuteOfDay,
        type: activeTab,
        ...(activeTab === 'DOSE'
          ? {
              medication: `${configuredMedication} ${releaseType}`.trim(),
              doseMg,
              releaseType,
            }
          : {}),
        ...(activeTab === 'CAFFEINE'
          ? {
              caffeineLabel: caffeinePreset.label,
              caffeineMg: caffeinePreset.mg,
            }
          : {}),
        ...(activeTab === 'SIDE_EFFECT'
          ? {
              sideEffects: selectedSideEffects.length ? selectedSideEffects : ['crash'],
              severity,
            }
          : {}),
        ...(publicEventNote.trim() ? { note: publicEventNote.trim() } : {}),
        createdAtUTC: new Date().toISOString(),
      };

      const updatedLog: DayLogDoc = {
        calendarDate,
        events: [...(dayLog?.events ?? []), newEvent].sort(
          (a, b) => a.minuteOfDay - b.minuteOfDay
        ),
        ...(dayLog?.eodSummary ? { eodSummary: dayLog.eodSummary } : {}),
        contextTags: dayLog?.contextTags ?? [],
        updatedAtUTC: new Date().toISOString(),
      };

      await onSaveDayLog(updatedLog);
      setPublicEventNote('');
      triggerToast();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!dayLog) return;
    const updatedLog: DayLogDoc = {
      ...dayLog,
      events: dayLog.events.filter((e) => e.id !== eventId),
      updatedAtUTC: new Date().toISOString(),
    };
    await onSaveDayLog(updatedLog);
  };

  const handleSaveNotesAndRatings = async () => {
    setIsSaving(true);
    try {
      const hasAnyRating =
        focusRating !== null || moodRating !== null || appetiteRating !== null;

      const updatedLog: DayLogDoc = {
        calendarDate,
        events: dayLog?.events ?? [],
        ...(hasAnyRating
          ? {
              eodSummary: {
                focus: focusRating,
                mood: moodRating,
                appetite: appetiteRating,
              },
            }
          : {}),
        contextTags,
        updatedAtUTC: new Date().toISOString(),
      };
      await onSaveDayLog(updatedLog);

      if (privateNoteText.trim() || privateNote?.note) {
        await onSavePrivateNote({
          calendarDate,
          note: privateNoteText.trim(),
          updatedAtUTC: new Date().toISOString(),
        });
      }
      triggerToast();
    } finally {
      setIsSaving(false);
    }
  };

  const formattedDate = formatDateDDMMYYYYWithWeekday(calendarDate, lang, 'long', t('present'));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white border-l border-slate-200 h-full flex flex-col justify-between overflow-y-auto shadow-2xl">
        {/* Clean Header */}
        <div className="p-5 border-b border-slate-200 sticky top-0 bg-white z-10 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {t('loggerTitle')} — <span className="font-mono">{formattedDate}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {savedToast && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                  <Check className="w-3.5 h-3.5" />
                  {t('savedFeedback')}
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Two Separated Top-Level Tabs so Doses & Ratings never look coupled */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setDrawerSection('events')}
              className={`py-2 px-3 rounded-md text-xs font-semibold transition cursor-pointer ${
                drawerSection === 'events'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('loggerTabEvents')}
            </button>
            <button
              type="button"
              onClick={() => setDrawerSection('notes')}
              className={`py-2 px-3 rounded-md text-xs font-semibold transition cursor-pointer ${
                drawerSection === 'notes'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('loggerTabDailyNotes')}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-6 flex-1">
          {drawerSection === 'events' ? (
            <>
              {/* Add Dose / Caffeine / Symptom Card */}
              <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    {t('eventTimeLabel')}:
                  </label>
                  <input
                    type="time"
                    value={timeLocal}
                    onChange={(e) => setTimeLocal(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Category Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'DOSE', label: t('eventTypeDose'), icon: <Pill className="w-3.5 h-3.5" /> },
                      {
                        id: 'CAFFEINE',
                        label: t('eventTypeCaffeine'),
                        icon: <Coffee className="w-3.5 h-3.5" />,
                      },
                      {
                        id: 'SIDE_EFFECT',
                        label: t('eventTypeSymptom'),
                        icon: <Zap className="w-3.5 h-3.5" />,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-2 px-2.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        activeTab === tab.id
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* DOSE Controls */}
                {activeTab === 'DOSE' && (
                  <div className="space-y-3 pt-1">
                    {/* Configured Medication */}
                    <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="font-medium text-slate-600">{t('medicationLabel')}:</span>
                      <span className="font-semibold text-slate-900">{configuredMedication}</span>
                    </div>

                    {/* Formulation / Release Type */}
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>{t('releaseTypeLabel')}:</span>
                      <div className="flex gap-1.5">
                        {(
                          [
                            { id: 'IR', label: t('releaseIrDesc') },
                            { id: 'LA', label: t('releaseLaDesc') },
                          ] as const
                        ).map((rt) => (
                          <button
                            key={rt.id}
                            type="button"
                            onClick={() => setReleaseType(rt.id)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer ${
                              releaseType === rt.id
                                ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            {rt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dose Amount */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                        <span>{t('doseAmountLabel')}:</span>
                        {isCustomDose && (
                          <button
                            type="button"
                            onClick={() => setIsCustomDose(false)}
                            className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                          >
                            {t('usePresetsBtn')}
                          </button>
                        )}
                      </div>
                      {!isCustomDose ? (
                        <div className="flex flex-wrap gap-1.5">
                          {activeDosePresets.map((mg) => (
                            <button
                              key={mg}
                              type="button"
                              onClick={() => setDoseMg(mg)}
                              className={`flex-1 min-w-[50px] py-2 rounded-lg font-mono text-xs font-bold border transition cursor-pointer ${
                                doseMg === mg
                                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {mg}mg
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomDose(true);
                              setCustomDoseInput(String(doseMg));
                            }}
                            className={`py-2 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                              !activeDosePresets.includes(doseMg)
                                ? 'bg-amber-500 text-white border-amber-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {t('customDoseLabel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="number"
                              step="0.5"
                              min="0.5"
                              max="1000"
                              value={customDoseInput}
                              onChange={(e) => {
                                setCustomDoseInput(e.target.value);
                                const val = parseFloat(e.target.value);
                                if (!Number.isNaN(val) && val > 0) setDoseMg(val);
                              }}
                              placeholder={t('customDosePlaceholder')}
                              className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-mono text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                            <span className="absolute right-3 top-2 text-[11px] text-slate-400 font-mono font-medium">
                              mg
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsCustomDose(false)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          >
                            OK
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* CAFFEINE Controls */}
                {activeTab === 'CAFFEINE' && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { label: 'Espresso (80mg)', mg: 80 },
                      { label: 'Coffee (120mg)', mg: 120 },
                      { label: 'Tea (40mg)', mg: 40 },
                    ].map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => setCaffeinePreset(c)}
                        className={`py-2.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          caffeinePreset.label === c.label
                            ? 'bg-purple-600 border-purple-700 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* SYMPTOM Controls */}
                {activeTab === 'SIDE_EFFECT' && (
                  <div className="space-y-3 pt-1">
                    <span className="block text-xs text-slate-600">{t('symptomSelectLabel')}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {SIDE_EFFECT_IDS.map((id) => {
                        const active = selectedSideEffects.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleSideEffect(id)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                              active
                                ? 'bg-rose-600 border-rose-700 text-white'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {translateSideEffect(id, lang)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-700 pt-1">
                      <span>{t('severityLabel')}:</span>
                      <div className="flex gap-1.5">
                        {([1, 2, 3, 4, 5] as const).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setSeverity(lvl)}
                            className={`w-8 h-8 rounded-lg font-mono font-bold border transition cursor-pointer ${
                              severity === lvl
                                ? 'bg-rose-600 text-white border-rose-700'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Optional Public Note */}
                <div>
                  <input
                    type="text"
                    placeholder={t('optionalNotePlaceholder')}
                    value={publicEventNote}
                    onChange={(e) => setPublicEventNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddEvent}
                  disabled={isSaving}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {activeTab === 'DOSE'
                      ? t('addEventButtonDose', {
                          mg: doseMg,
                          med: configuredMedication,
                          type: releaseType,
                          time: timeLocal,
                        })
                      : activeTab === 'CAFFEINE'
                      ? t('addEventButtonCaffeine', {
                          label: caffeinePreset.label,
                          time: timeLocal,
                        })
                      : t('addEventButtonSymptom', { time: timeLocal })}
                  </span>
                </button>
              </div>

              {/* Logged Events List for this day */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-700">
                  {t('loggedTodayHeader', { date: formattedDate })}
                </h3>
                {!dayLog || dayLog.events.length === 0 ? (
                  <p className="text-xs text-slate-500 p-4 rounded-lg bg-slate-50 border border-slate-200 text-center">
                    {t('noLoggedEventsYet')}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {dayLog.events.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-slate-800 font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">
                            {ev.timeLocal}
                          </span>
                          <span className="text-slate-800 font-medium">
                            {ev.type === 'DOSE' &&
                              `${ev.medication || t('medicationLabel')} • ${ev.doseMg}mg`}
                            {ev.type === 'CAFFEINE' && ev.caffeineLabel}
                            {ev.type === 'SIDE_EFFECT' &&
                              `${(ev.sideEffects ?? [])
                                .map((s) => translateSideEffect(s, lang))
                                .join(', ')} (${ev.severity}/5)`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(ev.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* TAB 2: Optional Ratings, Optional Day Tags & Private Note */
            <div className="space-y-5">
              {/* Optional 1-5 Ratings (Unselected by default) */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-800">{t('ratingsHeader')}</h3>
                  {(focusRating !== null || moodRating !== null || appetiteRating !== null) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFocusRating(null);
                        setMoodRating(null);
                        setAppetiteRating(null);
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      {t('clearRatingsBtn')}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">{t('ratingsSub')}</p>
                {(
                  [
                    { label: t('focusLabel'), val: focusRating, set: setFocusRating },
                    { label: t('moodLabel'), val: moodRating, set: setMoodRating },
                    { label: t('appetiteLabel'), val: appetiteRating, set: setAppetiteRating },
                  ] as const
                ).map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-700 font-medium">{row.label}</span>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => row.set(row.val === n ? null : n)}
                          className={`w-8 h-8 rounded-lg font-mono font-semibold border transition cursor-pointer ${
                            row.val === n
                              ? 'bg-blue-600 text-white border-blue-700'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Optional Context Tags */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-600" />
                  {t('tagsHeader')}
                </h3>
                <p className="text-[11px] text-slate-500">{t('tagsSub')}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {CONTEXT_TAG_OPTIONS.map((tag) => {
                    const selected = contextTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleContextTag(tag)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                          selected
                            ? 'bg-blue-600 border-blue-700 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {translateContextTag(tag, lang)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Private Note */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    {t('privateNoteHeader')}
                  </span>
                  <span className="text-[11px] text-slate-500">{t('privateNoteSub')}</span>
                </div>
                <textarea
                  rows={3}
                  value={privateNoteText}
                  onChange={(e) => setPrivateNoteText(e.target.value)}
                  placeholder={t('privateNotePlaceholder')}
                  className="w-full p-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveNotesAndRatings}
                disabled={isSaving}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{t('saveDailyNotesBtn')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 sticky bottom-0 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200 bg-white border border-slate-200 cursor-pointer"
          >
            {t('closeBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};

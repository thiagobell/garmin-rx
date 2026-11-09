import React, { useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  AlertTriangle,
  BatteryCharging,
  Brain,
  Calendar,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Dumbbell,
  Heart,
  Lock,
  Moon,
  Pill,
  Plus,
  Sliders,
  Zap,
} from 'lucide-react';
import { resolveRegimenColor } from '../utils/regimenColors';
import type {
  DayLogDoc,
  DaySummaryDoc,
  IntradayDetailsDoc,
  LoggedEvent,
  PrivateNoteDoc,
  RegimenEraDoc,
} from '../types';
import {
  formatBpm,
  formatDateDDMMYYYY,
  formatDateDDMMYYYYWithWeekday,
  formatDeltaBpm,
  formatNum,
  roundNum,
} from '../utils/format';
import {
  translateContextTag,
  translateEraTitle,
  translateSideEffect,
  useI18n,
} from '../i18n';
import { InfoTooltip } from './InfoTooltip';

interface DayExplorerProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  allDays: DaySummaryDoc[];
  currentDay: DaySummaryDoc;
  intraday: IntradayDetailsDoc;
  /** Previous day's intraday details — the last few evening hours are drawn before 00:00. */
  prevIntraday?: IntradayDetailsDoc;
  dayLog?: DayLogDoc;
  prevDayLog?: DayLogDoc;
  privateNote?: PrivateNoteDoc | null;
  regimenEras: RegimenEraDoc[];
  isOwner: boolean;
  onOpenQuickLog: (prefillTime?: string) => void;
  /** false when the selected day has no synced Garmin data yet (e.g. Today before the scheduled sync). */
  hasGarminData?: boolean;
  /** Watch-local "today" (YYYY-MM-DD) — selectable for logging even before the sync runs. */
  watchToday?: string;
}

function minuteToHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(1438, Math.round(min / 2) * 2));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function hhmmToMinute(hhmm: string): number {
  const parts = hhmm.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 0;
  return parts[0] * 60 + parts[1];
}

export const DayExplorer: React.FC<DayExplorerProps> = ({
  selectedDate,
  onSelectDate,
  allDays,
  currentDay,
  intraday,
  prevIntraday,
  dayLog,
  prevDayLog,
  privateNote,
  regimenEras,
  isOwner,
  onOpenQuickLog,
  hasGarminData = true,
  watchToday,
}) => {
  const { lang, t } = useI18n();
  const [pkDurationHours, setPkDurationHours] = useState<number>(4.0);
  const [quickFilter, setQuickFilter] = useState<'all' | 'workouts' | 'alerts' | 'doses'>('all');
  // Toggleable Garmin all-day stress summary (day-level values, no minute curve)
  const [showStress, setShowStress] = useState<boolean>(false);

  // Navigation dates: synced days plus watch-local "Today" (selectable for
  // logging even before the scheduled Garmin sync has created the day's doc).
  const navDates = useMemo(() => {
    const dates = allDays.map((d) => d.calendarDate);
    if (watchToday && !dates.includes(watchToday) && (!dates.length || watchToday > dates[dates.length - 1])) {
      dates.push(watchToday);
    }
    return dates;
  }, [allDays, watchToday]);
  const currentIdx = navDates.indexOf(selectedDate);

  const activeEra = useMemo(() => {
    return regimenEras.find(
      (e) => selectedDate >= e.startDate && selectedDate <= e.endDate
    );
  }, [regimenEras, selectedDate]);

  // Filtered dates with full DD/MM/YYYY labels
  const filteredDatesList = useMemo(() => {
    return allDays
      .filter((d) => {
        if (quickFilter === 'workouts') return d.workouts.length > 0;
        if (quickFilter === 'alerts')
          return (
            d.flags.hasAbnormalHrAlert ||
            d.flags.lateDoseCarryoverWarning ||
            d.flags.deltaHrExceeds20
          );
        if (quickFilter === 'doses') {
          return d.calendarDate >= '2026-09-22';
        }
        return true;
      })
      .slice(-8)
      .reverse();
  }, [allDays, quickFilter]);

  // How much of the previous evening is drawn before 00:00 in the 24h chart
  const PREV_DAY_TAIL_MINUTES = 180; // 3 hours

  const chartData = useMemo(() => {
    type ChartPoint = {
      t: string;
      minuteOfDay: number;
      bpm: number;
      seatedBpm: number | null;
      workoutBpm: number | null;
      bodyBattery: number | null;
      inWorkoutOrCooldown: boolean;
    };

    const entries: ChartPoint[] = [];
    let lastBb: number | null = null;

    const pushSource = (src: IntradayDetailsDoc | undefined, minuteShift: number) => {
      if (!src?.hrPoints.length) return;
      const bbMap = new Map<number, number>();
      src.bodyBatteryPoints.forEach((pt) => bbMap.set(pt.minuteOfDay, pt.level));
      if (lastBb === null && src.bodyBatteryPoints.length) {
        lastBb = src.bodyBatteryPoints[0].level;
      }

      for (const pt of src.hrPoints) {
        if (minuteShift < 0 && pt.minuteOfDay < 1440 - PREV_DAY_TAIL_MINUTES) continue;
        const shiftedMin = pt.minuteOfDay + minuteShift;
        const exactBb = bbMap.get(pt.minuteOfDay);
        if (exactBb !== undefined) lastBb = exactBb;
        entries.push({
          t: pt.t,
          minuteOfDay: shiftedMin,
          bpm: Math.round(pt.bpm),
          seatedBpm: pt.inWorkoutOrCooldown ? null : Math.round(pt.bpm),
          workoutBpm: pt.inWorkoutOrCooldown ? Math.round(pt.bpm) : null,
          bodyBattery: lastBb !== null ? Math.round(lastBb) : null,
          inWorkoutOrCooldown: pt.inWorkoutOrCooldown,
        });
      }
    };

    pushSource(prevIntraday, -1440); // previous evening tail (shifted before 00:00)
    pushSource(intraday, 0); // current day
    return entries;
  }, [intraday, prevIntraday]);

  // Whether previous-evening data exists (drawn to the left of midnight)
  const hasPrevTail = useMemo(
    () =>
      Boolean(
        prevIntraday?.hrPoints.some((p) => p.minuteOfDay >= 1440 - PREV_DAY_TAIL_MINUTES)
      ),
    [prevIntraday]
  );

  const events = dayLog?.events ?? [];
  const doseEvents = useMemo(
    () => events.filter((e) => e.type === 'DOSE').sort((a, b) => a.minuteOfDay - b.minuteOfDay),
    [events]
  );
  const caffeineEvents = useMemo(
    () => events.filter((e) => e.type === 'CAFFEINE'),
    [events]
  );
  const sideEffectEvents = useMemo(
    () => events.filter((e) => e.type === 'SIDE_EFFECT'),
    [events]
  );

  const dosePkWindows = useMemo(() => {
    const totalMin = Math.round(pkDurationHours * 60);
    const onsetMin = 45;
    const peakEndMin = Math.min(totalMin - 30, Math.round(totalMin * 0.625));

    return doseEvents.map((dose) => {
      const startMin = dose.minuteOfDay;
      const onsetEndMin = Math.min(1438, startMin + onsetMin);
      const peakEnd = Math.min(1438, startMin + peakEndMin);
      const wearOffEnd = Math.min(1438, startMin + totalMin);

      const activePts = intraday.hrPoints.filter(
        (p) =>
          p.minuteOfDay >= onsetEndMin &&
          p.minuteOfDay <= wearOffEnd &&
          !p.inWorkoutOrCooldown
      );
      const avgActiveHr =
        activePts.length > 0
          ? Math.round(activePts.reduce((acc, p) => acc + p.bpm, 0) / activePts.length)
          : null;
      const deltaHr =
        avgActiveHr !== null && currentDay.asleepBaselineHr !== null
          ? roundNum(avgActiveHr - currentDay.asleepBaselineHr, 1)
          : null;

      return {
        dose,
        startT: minuteToHHMM(startMin),
        onsetEndT: minuteToHHMM(onsetEndMin),
        peakEndT: minuteToHHMM(peakEnd),
        wearOffEndT: minuteToHHMM(wearOffEnd),
        startM: startMin,
        onsetEndM: onsetEndMin,
        peakEndM: peakEnd,
        wearOffEndM: wearOffEnd,
        avgActiveHr,
        deltaHr,
      };
    });
  }, [doseEvents, pkDurationHours, intraday.hrPoints, currentDay.asleepBaselineHr]);

  const getBpmAtMinute = (minuteOfDay: number): number | null => {
    if (!intraday.hrPoints.length) return null;
    let closest = intraday.hrPoints[0];
    let minDiff = Math.abs(closest.minuteOfDay - minuteOfDay);
    for (const pt of intraday.hrPoints) {
      const diff = Math.abs(pt.minuteOfDay - minuteOfDay);
      if (diff < minDiff) {
        minDiff = diff;
        closest = pt;
      }
    }
    return Math.round(closest.bpm);
  };

  const hoursSinceLastDoseBeforeSleep = useMemo(() => {
    const prevDoses = (prevDayLog?.events ?? [])
      .filter((e) => e.type === 'DOSE')
      .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
    if (!prevDoses.length || !currentDay.sleepStartLocal) return null;
    const lastDoseMin = prevDoses[prevDoses.length - 1].minuteOfDay;
    const sleepStartMin = hhmmToMinute(currentDay.sleepStartLocal);
    const adjustedSleepMin = sleepStartMin < 720 ? sleepStartMin + 1440 : sleepStartMin;
    const diffHours = (adjustedSleepMin - lastDoseMin) / 60;
    return diffHours > 0 ? roundNum(diffHours, 1) : null;
  }, [prevDayLog, currentDay.sleepStartLocal]);

  const hrvSplitPointT = useMemo(() => {
    const firstSecondHalf = intraday.hrvPoints.find((p) => p.half === 2);
    return firstSecondHalf?.t ?? null;
  }, [intraday.hrvPoints]);

  const deltaHr = roundNum(currentDay.flags.deltaSeatedHrBpm, 1);

  // Garmin stress summary segments (durations of rest/low/medium/high stress).
  // Percentages are normalised over whichever values are non-null; render a
  // single slate segment at 100% when nothing is measurable.
  const stressSegments = useMemo(() => {
    const raw: { key: string; label: string; pct: number; cls: string }[] = [
      { key: 'rest', label: t('stressRestLabel'), pct: currentDay.restStressPct ?? 0, cls: 'bg-slate-300' },
      { key: 'low', label: t('stressLowLabel'), pct: currentDay.lowStressPct ?? 0, cls: 'bg-emerald-400' },
      { key: 'medium', label: t('stressMediumLabel'), pct: currentDay.mediumStressPct ?? 0, cls: 'bg-amber-400' },
      { key: 'high', label: t('stressHighLabel'), pct: currentDay.highStressPct ?? 0, cls: 'bg-rose-400' },
    ].filter((s) => s.pct > 0);
    const total = raw.reduce((acc, s) => acc + s.pct, 0);
    if (total <= 0) return [{ key: 'none', label: t('stressRestLabel'), pct: 100, cls: 'bg-slate-300' }];
    return raw.map((s) => ({ ...s, pct: (s.pct / total) * 100 }));
  }, [
    currentDay.restStressPct,
    currentDay.lowStressPct,
    currentDay.mediumStressPct,
    currentDay.highStressPct,
    lang,
  ]);
  const hasStressSummary = currentDay.stressAvg !== null || currentDay.stressMax !== null;
  const sleepHours = currentDay.sleepDurationSec
    ? formatNum(currentDay.sleepDurationSec / 3600, 1)
    : '—';

  // DD/MM/YYYY with long weekday (e.g. 22/10/2026 (Thursday) / 22/10/2026 (Quinta-feira))
  const formattedSelectedDate = formatDateDDMMYYYYWithWeekday(selectedDate, lang, 'long', t('present'));
  const isToday = Boolean(watchToday && selectedDate === watchToday);

  // Actual bedtime & wake-up time from Garmin as chart minutes (2-minute grid)
  const wakeMin =
    currentDay.sleepEndLocal && hasGarminData
      ? Math.min(1440, Math.round(hhmmToMinute(currentDay.sleepEndLocal) / 2) * 2)
      : null;
  const bedMin =
    currentDay.sleepStartLocal && hasGarminData
      ? Math.min(1440, Math.round(hhmmToMinute(currentDay.sleepStartLocal) / 2) * 2)
      : null;

  // Start of the night mapped onto this chart's timeline. The night is one
  // continuous window ending at wake-up: bedtimes after midnight (like 00:52)
  // sit inside the current day, evening bedtimes (23:15) map into the
  // previous-evening tail as negative minutes, crossing the midnight separator.
  // Without a bedtime the old midnight-anchored behaviour is kept as fallback.
  const nightStartMin =
    bedMin !== null
      ? bedMin >= 18 * 60
        ? bedMin - 1440
        : bedMin
      : wakeMin !== null
        ? 0
        : null;

  // X-axis ticks: hourly labels on the previous-evening tail, 2-hourly for the day itself
  const xTicks = useMemo(() => {
    const tailTicks = [-180, -120, -60];
    const dayTicks = [0, 120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200, 1320, 1440];
    return hasPrevTail ? [...tailTicks, ...dayTicks] : dayTicks;
  }, [hasPrevTail]);

  return (
    <div className="space-y-6">
      {/* Clean Date Navigation Bar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center bg-slate-50 rounded-lg border border-slate-200 p-0.5">
              <button
                type="button"
                disabled={currentIdx <= 0}
                onClick={() => currentIdx > 0 && onSelectDate(navDates[currentIdx - 1])}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 transition cursor-pointer"
                title={t('prevDay')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-3">
                <Calendar className="w-4 h-4 text-blue-600" />
                <select
                  value={selectedDate}
                  onChange={(e) => onSelectDate(e.target.value)}
                  aria-label="Select Date"
                  className="bg-transparent font-mono text-sm font-semibold text-slate-900 focus:outline-none cursor-pointer"
                >
                  {navDates
                    .slice()
                    .reverse()
                    .map((d) => (
                      <option key={d} value={d} className="bg-white text-slate-900">
                        {formatDateDDMMYYYYWithWeekday(d, lang, 'short', t('present'))}
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="button"
                disabled={currentIdx < 0 || currentIdx >= navDates.length - 1}
                onClick={() =>
                  currentIdx >= 0 && currentIdx < navDates.length - 1 && onSelectDate(navDates[currentIdx + 1])
                }
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30 transition cursor-pointer"
                title={t('nextDay')}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {isToday && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white">
                {t('todayBadge')}
              </span>
            )}

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-600 bg-slate-100">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              UTC{currentDay.timezoneOffsetHours >= 0 ? '+' : '−'}
              {formatNum(Math.abs(currentDay.timezoneOffsetHours), 0)} ({t('watchTimezone')})
            </span>

            {activeEra && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                <Pill
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: resolveRegimenColor(activeEra.color, activeEra.id) }}
                />
                {translateEraTitle(activeEra.id, activeEra.title, lang)}
              </span>
            )}

            {dayLog?.contextTags?.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700"
              >
                {translateContextTag(tag, lang)}
              </span>
            ))}
          </div>
        </div>

        {/* Filter Dates Bar with full DD/MM/YYYY dates */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-medium">{t('filterDaysLabel')}</span>
          {(
            [
              { id: 'all', label: t('filterRecent') },
              { id: 'workouts', label: t('filterWorkouts') },
              { id: 'alerts', label: t('filterCarryover') },
              { id: 'doses', label: t('filterMedicated') },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setQuickFilter(f.id)}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                quickFilter === f.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}

          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            {filteredDatesList.slice(0, 5).map((d) => (
              <button
                key={d.calendarDate}
                type="button"
                onClick={() => onSelectDate(d.calendarDate)}
                className={`px-2.5 py-1 rounded-md font-mono text-xs border transition cursor-pointer ${
                  d.calendarDate === selectedDate
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {formatDateDDMMYYYYWithWeekday(d.calendarDate, lang, 'short', t('present'))}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pending-sync notice: Today (or a recent date) selected before the scheduled Garmin sync has run */}
      {!hasGarminData && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
          <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-amber-600" />
            {t('pendingSyncTitle')} — <span className="font-mono">{formattedSelectedDate}</span>
          </h2>
          <p className="text-xs text-amber-800 leading-relaxed">{t('pendingSyncBody')}</p>
        </div>
      )}

      {/* 4 Spacious KPI Summary Cards with Explanatory Tooltips */}
      {hasGarminData && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Sleeping HR */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
              {t('kpiSleepingHrTitle')}
              <InfoTooltip text={t('kpiSleepingHrTooltip')} />
            </span>
            <Heart className="w-4 h-4 text-blue-500 shrink-0" />
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {formatBpm(currentDay.asleepBaselineHr)}
            </span>
            <span className="text-xs text-slate-500">bpm</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {t('kpiSleepingHrSub', { rhr: formatBpm(currentDay.restingHr) })}
          </p>
        </div>

        {/* Card 2: Daytime Seated HR */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
              {t('kpiDaytimeHrTitle')}
              <InfoTooltip text={t('kpiDaytimeHrTooltip')} />
            </span>
            {deltaHr !== null && (
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-mono font-medium ${
                  deltaHr >= 20
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : deltaHr >= 12
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {formatDeltaBpm(deltaHr, 1)} bpm
              </span>
            )}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {formatBpm(currentDay.daytimeSeatedHr)}
            </span>
            <span className="text-xs text-slate-500">bpm</span>
            {currentDay.workouts.length > 0 && (
              <span className="ml-auto text-xs text-slate-500">
                {t('kpiDaytimeRawLabel', { bpm: formatBpm(currentDay.daytimeRawHr) })}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('kpiDaytimeHrSub')}</p>
        </div>

        {/* Card 3: Overnight HRV */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
              {t('kpiHrvTitle')}
              <InfoTooltip text={t('kpiHrvTooltip')} />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-amber-600">
              {formatNum(currentDay.earlyNightHrvAvg, 0)}
            </span>
            <span className="text-xs text-slate-400">→</span>
            <span className="text-2xl font-bold font-mono text-emerald-600">
              {formatNum(currentDay.lateNightHrvAvg, 0)}
            </span>
            <span className="text-xs text-slate-500">ms</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {t('kpiHrvSub', {
              avg: formatNum(currentDay.hrvNightAvg, 0),
              status: currentDay.hrvStatus ?? '—',
            })}
          </p>
        </div>

        {/* Card 4: Sleep & Body Battery */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
              {t('kpiSleepTitle')}
              <InfoTooltip text={t('kpiSleepTooltip')} />
            </span>
            <Moon className="w-4 h-4 text-indigo-500 shrink-0" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {currentDay.sleepScore ?? '—'}
            </span>
            <span className="text-xs text-slate-500">/ 100 ({sleepHours}h)</span>
            <span className="ml-auto text-xs text-slate-600 font-medium">
              {t('kpiSleepStressLabel', { stress: formatNum(currentDay.sleepStressAvg, 0) })}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {t('kpiBodyBatterySub', {
              charged: currentDay.bodyBatteryCharged ?? '—',
              drained: currentDay.bodyBatteryDrained ?? '—',
              high: currentDay.bodyBatteryHigh ?? '—',
            })}
          </p>
        </div>
      </div>
      )}

      {/* Main 24-Hour Heart Rate Chart */}
      {hasGarminData && (
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {t('chart24hTitle')} — {formattedSelectedDate}
              </h2>
              {isOwner && (
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  {t('chartClickHint')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">{t('chart24hSubtitle')}</p>
          </div>

          {/* Active Window Duration Control */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Sliders className="w-3.5 h-3.5 text-amber-600" />
              <span>{t('activeWindowLabel')}</span>
              <strong className="font-mono text-slate-900">{pkDurationHours.toFixed(1)}h</strong>
              <InfoTooltip text={t('activeWindowTooltip')} />
            </div>
            <input
              type="range"
              min={3.0}
              max={6.0}
              step={0.5}
              value={pkDurationHours}
              onChange={(e) => setPkDurationHours(parseFloat(e.target.value))}
              aria-label="Medication Active Window Hours"
              className="w-24 accent-amber-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Legend & Dose/Workout Summary */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-amber-400/30 border border-amber-500" />
            {t('legendMedicationActive')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-emerald-400/30 border border-emerald-500" />
            {t('legendWorkout')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-indigo-400/30 border border-indigo-500" />
            {t('sleepBandLegend')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue-500" />
            {t('legendBodyBattery')}
          </span>

          {/* Toggleable Garmin all-day stress summary */}
          <button
            type="button"
            onClick={() => setShowStress((s) => !s)}
            title={t('stressToggleHint')}
            className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
              showStress
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            {t('stressToggle')}
          </button>
        </div>

        {/* Garmin all-day stress summary panel (day-level values — the
            minute-level stress curve is not exposed by Garmin's Personal API) */}
        {showStress && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 rounded-lg bg-violet-50/70 border border-violet-200 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-violet-900">
              <Brain className="w-3.5 h-3.5 text-violet-600" />
              {t('stressPanelTitle')}
              <InfoTooltip text={t('stressPanelTooltip')} />
            </span>
            {hasStressSummary ? (
              <>
                <span className="px-2 py-0.5 rounded bg-white border border-violet-200 font-mono font-medium text-violet-800">
                  {t('stressAvgLabel', { value: formatNum(currentDay.stressAvg, 0) })}
                </span>
                <span className="px-2 py-0.5 rounded bg-white border border-violet-200 font-mono font-medium text-violet-800">
                  {t('stressMaxLabel', { value: formatNum(currentDay.stressMax, 0) })}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Segmented distribution of the day's stress durations */}
                  <div className="flex h-2.5 w-44 rounded-full overflow-hidden border border-violet-200/70">
                    {stressSegments.map((seg) => (
                      <div
                        key={seg.key}
                        title={`${seg.label}: ${formatNum(seg.pct, 0)}%`}
                        style={{ width: `${seg.pct}%` }}
                        className={seg.cls}
                      />
                    ))}
                  </div>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate-600">
                    {stressSegments.map((seg) => (
                      <span key={seg.key} className="inline-flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-xs ${seg.cls}`} />
                        {seg.label} {formatNum(seg.pct, 0)}%
                      </span>
                    ))}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-slate-500">{t('stressNoData')}</span>
            )}
          </div>
        )}

        {(dosePkWindows.length > 0 || currentDay.workouts.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {dosePkWindows.map((pk, i) => (
              <div
                key={pk.dose.id}
                className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900"
              >
                <Pill className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-medium">
                  {t('doseSummaryBadge', {
                    idx: i + 1,
                    mg: pk.dose.doseMg ?? 10,
                    type: pk.dose.releaseType ?? 'IR',
                    time: pk.dose.timeLocal,
                  })}
                </span>
                {pk.avgActiveHr !== null && (
                  <span className="px-2 py-0.5 rounded bg-white border border-amber-200 font-mono text-amber-800">
                    {t('doseWindowHrBadge', {
                      hr: formatBpm(pk.avgActiveHr),
                      delta: formatDeltaBpm(pk.deltaHr, 1),
                    })}
                  </span>
                )}
              </div>
            ))}

            {currentDay.workouts.map((w) => (
              <div
                key={w.activityId}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900"
              >
                <Dumbbell className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-medium">
                  {t('workoutBadge', {
                    name: w.activityName,
                    start: w.startHourMinLocal,
                    end: w.endHourMinLocal,
                    cooldown: w.cooldownEndHourMinLocal,
                  })}
                </span>
                <span className="font-mono text-emerald-700">
                  ({formatBpm(w.averageHR)} / {formatBpm(w.maxHR)} bpm)
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Recharts 24h ComposedChart */}
        <div className="h-[360px] w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 14, right: 12, left: 0, bottom: 8 }}
              onClick={(state) => {
                if (isOwner && state && state.activeLabel) {
                  const activeMin = Number(state.activeLabel);
                  if (!Number.isNaN(activeMin) && activeMin >= 0) {
                    onOpenQuickLog(minuteToHHMM(activeMin));
                  }
                }
              }}
            >
              <defs>
                <linearGradient id="seatedHrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e11d48" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#e11d48" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="workoutHrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                type="number"
                dataKey="minuteOfDay"
                domain={hasPrevTail ? [-180, 1440] : [0, 1440]}
                ticks={xTicks}
                tickFormatter={(m: number) => minuteToHHMM(m < 0 ? m + 1440 : m)}
                stroke="#94a3b8"
                tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              />
              <YAxis
                yAxisId="hr"
                domain={[40, 190]}
                stroke="#94a3b8"
                tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                unit=" bpm"
                width={64}
              />
              <YAxis
                yAxisId="bb"
                orientation="right"
                domain={[0, 100]}
                stroke="#3b82f6"
                tick={{ fill: '#2563eb', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                unit="%"
                width={46}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#cbd5e1',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: '#0f172a',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                }}
                labelStyle={{ color: '#0f172a', fontFamily: 'JetBrains Mono', fontWeight: 600 }}
                formatter={(value: number, _name: string, item) => {
                  const dataKey = String(item?.dataKey ?? '');
                  if (dataKey === 'bodyBattery') {
                    return (
                      <span className="inline-flex items-center gap-1">
                        <BatteryCharging className="w-3 h-3 text-blue-600" />
                        {Math.round(value)}
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center gap-1">
                      <Heart
                        className={`w-3 h-3 fill-current ${
                          dataKey === 'workoutBpm' ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      />
                      {Math.round(value)}
                    </span>
                  );
                }}
                labelFormatter={(m: number) =>
                  m < 0 ? `${minuteToHHMM(m + 1440)}${t('prevDayTooltipSuffix')}` : minuteToHHMM(m)
                }
              />

              {/* Previous evening tail (raw data from the day before, to the left of midnight) —
                  no shading, only the midnight separator line marks where the current day begins */}
              {hasPrevTail && (
                <ReferenceLine
                  yAxisId="hr"
                  x={0}
                  stroke="#475569"
                  strokeWidth={1.5}
                  label={{
                    value: t('prevDayBandLabel'),
                    position: 'left',
                    fill: '#64748b',
                    fontSize: 10,
                  }}
                />
              )}

              {/* Actual sleep window from Garmin: continuous band from the real
                  bedtime to wake-up (crosses the midnight separator when the
                  bedtime is in the previous evening; starts inside the current
                  day when the bedtime is after midnight like 00:52) */}
              {wakeMin !== null && nightStartMin !== null && (
                <ReferenceArea
                  yAxisId="hr"
                  x1={Math.max(0, nightStartMin)}
                  x2={wakeMin}
                  fill="#6366f1"
                  fillOpacity={0.07}
                />
              )}
              {wakeMin !== null && (
                <ReferenceLine
                  yAxisId="hr"
                  x={wakeMin}
                  stroke="#6366f1"
                  strokeWidth={1.5}
                  strokeDasharray="2 4"
                  label={{
                    value: t('wakeMarkerIcon'),
                    position: 'top',
                    fontSize: 16,
                  }}
                />
              )}
              {nightStartMin !== null && (nightStartMin >= 0 || hasPrevTail) && (
                <ReferenceLine
                  yAxisId="hr"
                  x={nightStartMin}
                  stroke="#6366f1"
                  strokeWidth={1.5}
                  strokeDasharray="2 4"
                  label={{
                    value: t('bedtimeMarkerIcon'),
                    position: 'insideTopRight',
                    fontSize: 16,
                  }}
                />
              )}

              <ReferenceArea
                yAxisId="hr"
                x1={4 * 60}
                x2={7 * 60}
                fill="#3b82f6"
                fillOpacity={0.07}
                label={{
                  value: t('baselineBandLabel'),
                  position: 'insideTopLeft',
                  fill: '#2563eb',
                  fontSize: 10,
                }}
              />
              {currentDay.asleepBaselineHr && (
                <ReferenceLine
                  yAxisId="hr"
                  y={Math.round(currentDay.asleepBaselineHr)}
                  stroke="#2563eb"
                  strokeDasharray="5 5"
                  label={{
                    value: t('baselineLineLabel', { bpm: formatBpm(currentDay.asleepBaselineHr) }),
                    position: 'insideBottomLeft',
                    fill: '#1d4ed8',
                    fontSize: 11,
                  }}
                />
              )}

              {dosePkWindows.map((pk, idx) => (
                <React.Fragment key={pk.dose.id}>
                  <ReferenceArea
                    yAxisId="hr"
                    x1={pk.startM}
                    x2={pk.onsetEndM}
                    fill="#f59e0b"
                    fillOpacity={0.08}
                  />
                  <ReferenceArea
                    yAxisId="hr"
                    x1={pk.onsetEndM}
                    x2={pk.peakEndM}
                    fill="#f59e0b"
                    fillOpacity={0.16}
                    label={{
                      value: `💊 #${idx + 1} (${pk.dose.doseMg ?? 10}mg)`,
                      position: 'insideTop',
                      fill: '#b45309',
                      fontSize: 11,
                    }}
                  />
                  <ReferenceArea
                    yAxisId="hr"
                    x1={pk.peakEndM}
                    x2={pk.wearOffEndM}
                    fill="#f59e0b"
                    fillOpacity={0.07}
                  />
                  <ReferenceLine
                    yAxisId="hr"
                    x={pk.startM}
                    stroke="#d97706"
                    strokeWidth={1.5}
                  />
                </React.Fragment>
              ))}

              {currentDay.workouts.map((w) => {
                const startM = hhmmToMinute(w.startHourMinLocal);
                const cooldownM = hhmmToMinute(w.cooldownEndHourMinLocal);
                return (
                  <ReferenceArea
                    key={w.activityId}
                    yAxisId="hr"
                    x1={startM}
                    x2={cooldownM}
                    fill="#10b981"
                    fillOpacity={0.14}
                    label={{
                      value: w.activityName,
                      position: 'insideTopRight',
                      fill: '#047857',
                      fontSize: 11,
                    }}
                  />
                );
              })}

              {caffeineEvents.map((c) => (
                <ReferenceLine
                  key={c.id}
                  yAxisId="hr"
                  x={c.minuteOfDay}
                  stroke="#7c3aed"
                  strokeDasharray="3 3"
                  label={{
                    value: t('caffeineMarkerIcon'),
                    position: 'top',
                    fontSize: 16,
                  }}
                />
              ))}

              {sideEffectEvents.map((se) => {
                const bpmAtPin = getBpmAtMinute(se.minuteOfDay);
                const labels = (se.sideEffects ?? []).map((s) => translateSideEffect(s, lang));
                return (
                  <ReferenceLine
                    key={se.id}
                    yAxisId="hr"
                    x={se.minuteOfDay}
                    stroke="#e11d48"
                    strokeWidth={2}
                    label={{
                      value: `${labels.join(', ')} (${bpmAtPin ?? '—'} bpm)`,
                      position: 'insideBottomRight',
                      fill: '#be123c',
                      fontSize: 11,
                    }}
                  />
                );
              })}

              <Area
                yAxisId="hr"
                type="monotone"
                dataKey="seatedBpm"
                name={t('seatedHrSeries')}
                stroke="#e11d48"
                strokeWidth={1.8}
                fill="url(#seatedHrFill)"
                connectNulls={false}
                isAnimationActive={false}
              />

              <Area
                yAxisId="hr"
                type="monotone"
                dataKey="workoutBpm"
                name={t('workoutHrSeries')}
                stroke="#059669"
                strokeWidth={2}
                fill="url(#workoutHrFill)"
                connectNulls={false}
                isAnimationActive={false}
              />

              <Line
                yAxisId="bb"
                type="monotone"
                dataKey="bodyBattery"
                name={t('bodyBatterySeries')}
                stroke="#2563eb"
                strokeWidth={1.8}
                dot={false}
                strokeDasharray="4 2"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Bottom Grid: Sleep HRV Chart + Daily Logged Events */}
      <div className={`grid grid-cols-1 ${hasGarminData ? 'lg:grid-cols-12' : ''} gap-6`}>
        {/* Overnight Sleep HRV Chart */}
        {hasGarminData && (
        <div className="lg:col-span-7 p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                {t('chartHrvTitle')}
                <InfoTooltip text={t('chartHrvTooltip')} />
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('chartHrvSubtitle', { date: formattedSelectedDate })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {hoursSinceLastDoseBeforeSleep !== null && (
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${
                    hoursSinceLastDoseBeforeSleep < 7.5
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}
                >
                  {t('lastDoseToSleepBadge', {
                    hours: formatNum(hoursSinceLastDoseBeforeSleep, 1),
                  })}
                </span>
              )}
              {currentDay.flags.lateDoseCarryoverWarning && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 border border-amber-200 text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  {t('lateCarryoverBadge')}
                </span>
              )}
            </div>
          </div>

          {currentDay.hrvBaseline?.balancedLow && currentDay.hrvBaseline?.balancedUpper && (
            <p className="text-xs text-emerald-800 bg-emerald-50/70 border border-emerald-200/80 rounded-lg px-3 py-1.5">
              {t('balancedBandNote', {
                low: formatNum(currentDay.hrvBaseline.balancedLow, 0),
                high: formatNum(currentDay.hrvBaseline.balancedUpper, 0),
              })}
            </p>
          )}

          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={intraday.hrvPoints}
                margin={{ top: 12, right: 14, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="t"
                  stroke="#94a3b8"
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  interval={14}
                />
                <YAxis
                  domain={[10, 95]}
                  stroke="#94a3b8"
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  unit=" ms"
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#0f172a',
                  }}
                />

                {currentDay.hrvBaseline?.balancedLow && currentDay.hrvBaseline?.balancedUpper && (
                  <ReferenceArea
                    y1={currentDay.hrvBaseline.balancedLow}
                    y2={currentDay.hrvBaseline.balancedUpper}
                    fill="#10b981"
                    fillOpacity={0.14}
                  />
                )}

                {hrvSplitPointT && (
                  <ReferenceLine
                    x={hrvSplitPointT}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                    label={{
                      value: t('hrvSplitLabel', {
                        early: formatNum(currentDay.earlyNightHrvAvg, 0),
                        late: formatNum(currentDay.lateNightHrvAvg, 0),
                      }),
                      position: 'top',
                      fill: '#b45309',
                      fontSize: 11,
                    }}
                  />
                )}

                <Area
                  type="monotone"
                  dataKey="hrv"
                  name={t('hrvSeriesName')}
                  stroke="#0284c7"
                  fill="#0284c7"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        )}

        {/* Daily Logged Doses & Notes Card */}
        <div className={`${hasGarminData ? 'lg:col-span-5' : ''} p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-4`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {t('dailyLogCardTitle', { date: formattedSelectedDate })}
                </h3>
                <p className="text-xs text-slate-500">{t('dailyLogCardSub')}</p>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => onOpenQuickLog()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('addEntryBtn')}
                </button>
              )}
            </div>

            {events.length === 0 ? (
              <div className="p-6 rounded-lg bg-slate-50 border border-slate-200/80 text-center text-xs text-slate-500">
                {t('noEventsForDay', { date: formattedSelectedDate })}
              </div>
            ) : (
              <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
                {events
                  .slice()
                  .sort((a, b) => a.minuteOfDay - b.minuteOfDay)
                  .map((ev: LoggedEvent) => {
                    const bpmAtEvent = getBpmAtMinute(ev.minuteOfDay);
                    return (
                      <div
                        key={ev.id}
                        className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="font-mono font-semibold text-slate-700 px-2 py-0.5 rounded bg-white border border-slate-200">
                            {ev.timeLocal}
                          </span>
                          <div>
                            {ev.type === 'DOSE' && (
                              <div className="font-semibold text-amber-800 flex items-center gap-1.5">
                                <Pill className="w-3.5 h-3.5 text-amber-600" />
                                {ev.medication || t('medicationLabel')} • {ev.doseMg ?? 10}mg (
                                {ev.releaseType ?? 'IR'})
                              </div>
                            )}
                            {ev.type === 'CAFFEINE' && (
                              <div className="font-semibold text-purple-800 flex items-center gap-1.5">
                                <Coffee className="w-3.5 h-3.5 text-purple-600" />
                                {ev.caffeineLabel ?? 'Caffeine'}
                              </div>
                            )}
                            {ev.type === 'SIDE_EFFECT' && (
                              <div className="font-semibold text-rose-800 flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-rose-600" />
                                {(ev.sideEffects ?? [])
                                  .map((s) => translateSideEffect(s, lang))
                                  .join(', ')}{' '}
                                ({ev.severity ?? 1}/5)
                              </div>
                            )}
                            {ev.note && <p className="text-slate-600 mt-0.5">{ev.note}</p>}
                          </div>
                        </div>
                        {bpmAtEvent !== null && (
                          <span className="shrink-0 font-mono text-[11px] px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                            {bpmAtEvent} bpm
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Daily Ratings (only shown if at least one rating was explicitly saved) & Private Note */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            {dayLog?.eodSummary &&
              (dayLog.eodSummary.focus !== null ||
                dayLog.eodSummary.mood !== null ||
                dayLog.eodSummary.appetite !== null) && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500">{t('focusLabel')}</div>
                    <div className="text-sm font-mono font-bold text-slate-800">
                      {dayLog.eodSummary.focus ?? '—'} / 5
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500">{t('moodLabel')}</div>
                    <div className="text-sm font-mono font-bold text-slate-800">
                      {dayLog.eodSummary.mood ?? '—'} / 5
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500">{t('appetiteLabel')}</div>
                    <div className="text-sm font-mono font-bold text-slate-800">
                      {dayLog.eodSummary.appetite ?? '—'} / 5
                    </div>
                  </div>
                </div>
              )}

            {isOwner && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <div className="flex items-center justify-between text-slate-700 font-medium mb-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    {t('privateNoteLabel')}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenQuickLog()}
                    className="text-xs text-blue-600 hover:underline cursor-pointer"
                  >
                    {t('editBtn')}
                  </button>
                </div>
                <p className="text-slate-600 italic">
                  {privateNote?.note || t('noPrivateNote')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

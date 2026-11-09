import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Calendar, Layers, Pill, Settings } from 'lucide-react';
import type { DayLogDoc, DaySummaryDoc, RegimenEraDoc } from '../types';
import { formatDateDDMMYYYY, formatDeltaBpm, formatNum } from '../utils/format';
import {
  DEFAULT_CURRENT_TREATMENT_COLOR,
  DEFAULT_PRE_TREATMENT_COLOR,
  resolveRegimenColor,
} from '../utils/regimenColors';
import { translateEraTitle, useI18n } from '../i18n';

interface RegimenComparisonProps {
  allDays: DaySummaryDoc[];
  dayLogs: Record<string, DayLogDoc>;
  regimenEras: RegimenEraDoc[];
  isOwner: boolean;
  onOpenSettings: () => void;
}

interface AggregatedRow {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  daysCount: number;
  avgAsleepHr: number | null;
  avgSeatedDaytimeHr: number | null;
  avgDeltaHr: number | null;
  avgEarlyNightHrv: number | null;
  avgLateNightHrv: number | null;
  avgSleepDurationHours: number | null;
  avgDeepRemPct: number | null;
  avgSleepStress: number | null;
  sideEffectDaysPct: number;
  avgFocusRating: number | null;
}

function avgOf(nums: (number | null | undefined)[], decimals = 1): number | null {
  const valid = nums.filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  if (!valid.length) return null;
  const factor = Math.pow(10, decimals);
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * factor) / factor;
}

export const RegimenComparison: React.FC<RegimenComparisonProps> = ({
  allDays,
  dayLogs,
  regimenEras,
  isOwner,
  onOpenSettings,
}) => {
  const { lang, t } = useI18n();

  const buildAggregate = (
    id: string,
    title: string,
    subtitle: string,
    color: string,
    subset: DaySummaryDoc[]
  ): AggregatedRow => {
    const deepRemPcts = subset.map((d) => {
      if (!d.sleepDurationSec || d.sleepDurationSec <= 0) return null;
      const deep = d.deepSleepSec ?? 0;
      const rem = d.remSleepSec ?? 0;
      return ((deep + rem) / d.sleepDurationSec) * 100;
    });

    let seDays = 0;
    const focusRatings: number[] = [];
    for (const d of subset) {
      const log = dayLogs[d.calendarDate];
      if (log) {
        if (log.events.some((e) => e.type === 'SIDE_EFFECT')) seDays++;
        if (typeof log.eodSummary?.focus === 'number') {
          focusRatings.push(log.eodSummary.focus);
        }
      }
    }

    return {
      id,
      title,
      subtitle,
      color,
      daysCount: subset.length,
      avgAsleepHr: avgOf(subset.map((d) => d.asleepBaselineHr), 0),
      avgSeatedDaytimeHr: avgOf(subset.map((d) => d.daytimeSeatedHr), 0),
      avgDeltaHr: avgOf(subset.map((d) => d.flags.deltaSeatedHrBpm), 1),
      avgEarlyNightHrv: avgOf(subset.map((d) => d.earlyNightHrvAvg), 0),
      avgLateNightHrv: avgOf(subset.map((d) => d.lateNightHrvAvg), 0),
      avgSleepDurationHours: avgOf(
        subset.map((d) => (d.sleepDurationSec ? d.sleepDurationSec / 3600 : null)),
        1
      ),
      avgDeepRemPct: avgOf(deepRemPcts, 0),
      avgSleepStress: avgOf(subset.map((d) => d.sleepStressAvg), 0),
      sideEffectDaysPct: subset.length ? Math.round((seDays / subset.length) * 100) : 0,
      avgFocusRating: avgOf(focusRatings, 1),
    };
  };

  // GROUP 1: Linear, consecutive chronological time periods
  const chronologicalRows = useMemo(() => {
    const preTreatmentDays = allDays.filter((d) => d.calendarDate <= '2026-09-21');
    const treatmentDays = allDays.filter((d) => d.calendarDate >= '2026-09-22');

    const basePeriods: AggregatedRow[] = [
      buildAggregate(
        'period-pre-treatment',
        t('cohortPreTreatmentTitle'),
        t('cohortPreTreatmentSub'),
        DEFAULT_PRE_TREATMENT_COLOR,
        preTreatmentDays
      ),
      buildAggregate(
        'period-treatment',
        t('cohortTreatmentTitle'),
        t('cohortTreatmentSub'),
        DEFAULT_CURRENT_TREATMENT_COLOR,
        treatmentDays
      ),
    ];

    // Also include any custom user-created periods that don't duplicate the two default periods
    // Only the two canonical phases exist ("pre-treatment" / current regimen).
    // The legacy era ids are filtered too in case older era documents
    // still lurk in Firestore before the seed script had a chance to delete
    // them — otherwise they would appear here as duplicate rows.
    const defaultIds = new Set([
      'era-pre-treatment',
      'era-treatment',
      'era-since-starting-treatment',
      'era-unmedicated-baseline',
    ]);

    const customEras = regimenEras
      .filter((e) => !defaultIds.has(e.id))
      .map((era) => {
        const subset = allDays.filter(
          (d) => d.calendarDate >= era.startDate && d.calendarDate <= era.endDate
        );
        return buildAggregate(
          era.id,
          translateEraTitle(era.id, era.title, lang),
          `${formatDateDDMMYYYY(era.startDate, t('present'))} → ${formatDateDDMMYYYY(
            era.endDate,
            t('present')
          )}`,
          resolveRegimenColor(era.color, era.id),
          subset
        );
      });

    return [...basePeriods, ...customEras];
  }, [allDays, dayLogs, regimenEras, lang, t]);

  // GROUP 2: Non-consecutive groupings by actual logged medication status & daily dose
  const medicationStatusRows = useMemo(() => {
    const preTreatmentDays = allDays.filter((d) => d.calendarDate <= '2026-09-21');

    const getDailyTotalMg = (date: string): number => {
      const log = dayLogs[date];
      if (!log) return 0;
      return log.events
        .filter((e) => e.type === 'DOSE')
        .reduce((sum, e) => sum + (e.doseMg ?? 10), 0);
    };

    const offDaysSinceStart = allDays.filter(
      (d) => d.calendarDate >= '2026-09-22' && getDailyTotalMg(d.calendarDate) === 0
    );

    const allMedicatedDays = allDays.filter((d) => getDailyTotalMg(d.calendarDate) > 0);
    const lowDoseDays = allDays.filter((d) => {
      const mg = getDailyTotalMg(d.calendarDate);
      return mg > 0 && mg <= 10;
    });

    const rows: AggregatedRow[] = [
      buildAggregate(
        'status-pre-treatment',
        t('cohortPreTreatmentTitle'),
        t('cohortPreTreatmentSub'),
        DEFAULT_PRE_TREATMENT_COLOR,
        preTreatmentDays
      ),
      buildAggregate(
        'status-off-days-since-start',
        t('cohortOffDaysAfterStartTitle'),
        t('cohortOffDaysAfterStartSub'),
        '#059669',
        offDaysSinceStart
      ),
      buildAggregate(
        'status-all-medicated',
        t('cohortAllMedicatedDaysTitle'),
        t('cohortAllMedicatedDaysSub'),
        '#e11d48',
        allMedicatedDays
      ),
    ];

    if (lowDoseDays.length > 0) {
      rows.push(
        buildAggregate(
          'status-low-dose',
          t('cohortLowDoseDaysTitle'),
          t('cohortLowDoseDaysSub'),
          '#f59e0b',
          lowDoseDays
        )
      );
    }

    return rows;
  }, [allDays, dayLogs, t]);

  const renderTable = (rows: AggregatedRow[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
            <th className="py-3 px-4">{t('colGroup')}</th>
            <th className="py-3 px-3 text-center">{t('colDaysCount')}</th>
            <th className="py-3 px-3 text-center">{t('colAsleepBase')}</th>
            <th className="py-3 px-3 text-center">{t('colDaySeated')}</th>
            <th className="py-3 px-3 text-center">{t('colSeatedDelta')}</th>
            <th className="py-3 px-3 text-center">{t('colEarlyLateHrv')}</th>
            <th className="py-3 px-3 text-center">{t('colSleepDur')}</th>
            <th className="py-3 px-3 text-center">{t('colDeepRem')}</th>
            <th className="py-3 px-3 text-center">{t('colSleepStress')}</th>
            <th className="py-3 px-3 text-center">{t('colSymptomsFreq')}</th>
            <th className="py-3 px-3 text-center">{t('colAvgFocus')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70 text-xs">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/80 transition">
              <td className="py-3.5 px-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                  <div>
                    <div className="font-semibold text-slate-900">{row.title}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{row.subtitle}</div>
                  </div>
                </div>
              </td>

              <td className="py-3.5 px-3 text-center font-mono text-slate-700 font-medium">
                {row.daysCount}
              </td>

              <td className="py-3.5 px-3 text-center font-mono text-blue-700 font-semibold">
                {row.avgAsleepHr ?? '—'} bpm
              </td>

              <td className="py-3.5 px-3 text-center font-mono text-slate-900 font-semibold">
                {row.avgSeatedDaytimeHr ?? '—'} bpm
              </td>

              <td className="py-3.5 px-3 text-center font-mono">
                {row.avgDeltaHr !== null ? (
                  <span
                    className={`px-2 py-0.5 rounded-md font-semibold border ${
                      row.avgDeltaHr >= 16
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {formatDeltaBpm(row.avgDeltaHr, 1)} bpm
                  </span>
                ) : (
                  '—'
                )}
              </td>

              <td className="py-3.5 px-3 text-center font-mono">
                <span className="text-amber-700">{row.avgEarlyNightHrv ?? '—'}</span>
                <span className="text-slate-400 mx-1">→</span>
                <span className="text-emerald-700 font-semibold">
                  {row.avgLateNightHrv ?? '—'} ms
                </span>
              </td>

              <td className="py-3.5 px-3 text-center font-mono text-slate-700">
                {row.avgSleepDurationHours !== null
                  ? `${formatNum(row.avgSleepDurationHours, 1)}h`
                  : '—'}
              </td>

              <td className="py-3.5 px-3 text-center font-mono text-indigo-700">
                {row.avgDeepRemPct !== null ? `${formatNum(row.avgDeepRemPct, 0)}%` : '—'}
              </td>

              <td className="py-3.5 px-3 text-center font-mono">
                <span
                  className={
                    (row.avgSleepStress ?? 0) >= 22
                      ? 'text-rose-700 font-semibold'
                      : 'text-emerald-700'
                  }
                >
                  {row.avgSleepStress ?? '—'}
                </span>
              </td>

              <td className="py-3.5 px-3 text-center font-mono text-slate-600">
                {row.sideEffectDaysPct}%
              </td>

              <td className="py-3.5 px-3 text-center font-mono font-semibold text-blue-700">
                {row.avgFocusRating !== null
                  ? `${formatNum(row.avgFocusRating, 1)} / 5`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">
              {t('comparisonTitle')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">{t('comparisonSubtitle')}</p>
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition cursor-pointer shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" />
            <span>{t('configurePeriodsBtn')}</span>
          </button>
        )}
      </div>

      {/* GROUP 1: Chronological Time Periods */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/60">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            {t('group1Title')}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{t('group1Subtitle')}</p>
        </div>
        {renderTable(chronologicalRows)}
      </div>

      {/* GROUP 2: Non-Consecutive Days by Logged Medication Status */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/60">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Pill className="w-4 h-4 text-amber-600" />
            {t('group2Title')}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{t('group2Subtitle')}</p>
        </div>
        {renderTable(medicationStatusRows)}
      </div>

      {/* Visual Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">{t('chartCompareHrTitle')}</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={medicationStatusRows}
                margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="title"
                  stroke="#94a3b8"
                  tick={{ fill: '#475569', fontSize: 10 }}
                  interval={0}
                />
                <YAxis
                  domain={[40, 95]}
                  stroke="#94a3b8"
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  unit=" bpm"
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
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="avgAsleepHr"
                  name={t('colAsleepBase')}
                  fill="#2563eb"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="avgSeatedDaytimeHr"
                  name={t('colDaySeated')}
                  fill="#d97706"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">{t('chartCompareHrvTitle')}</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={medicationStatusRows}
                margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="title"
                  stroke="#94a3b8"
                  tick={{ fill: '#475569', fontSize: 10 }}
                  interval={0}
                />
                <YAxis
                  domain={[20, 95]}
                  stroke="#94a3b8"
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  unit=" ms"
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
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="avgEarlyNightHrv"
                  name="1st Half HRV"
                  fill="#d97706"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="avgLateNightHrv"
                  name="2nd Half HRV"
                  fill="#059669"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

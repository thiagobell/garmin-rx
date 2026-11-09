import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  AlertTriangle,
  Brain,
  Clock,
  HeartPulse,
  Moon,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import type { DayLogDoc, DaySummaryDoc, RegimenEraDoc } from '../types';
import {
  formatDateDDMMYYYYWithWeekday,
  formatNum,
  roundNum,
} from '../utils/format';
import { translateEraTitle, useI18n } from '../i18n';
import { resolveUniqueRegimenColor } from '../utils/regimenColors';
import { InfoTooltip } from './InfoTooltip';

interface LongitudinalSafetyProps {
  allDays: DaySummaryDoc[];
  dayLogs: Record<string, DayLogDoc>;
  regimenEras: RegimenEraDoc[];
  onSelectDateAndJump: (date: string) => void;
}

function hhmmToMinute(hhmm: string): number {
  const parts = hhmm.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 0;
  return parts[0] * 60 + parts[1];
}

// Era colors are resolved through the validated regimen palette
// (utils/regimenColors.ts): the palette never reuses a data-series color, and
// resolveUniqueRegimenColor() additionally guarantees that two visible era
// bands never share the same color. Periods saved before the palette existed
// (or with a free-picked legacy color) are remapped deterministically here, so
// the shading always matches the badge colors used everywhere else in the app.

export const LongitudinalSafety: React.FC<LongitudinalSafetyProps> = ({
  allDays,
  dayLogs,
  regimenEras,
  onSelectDateAndJump,
}) => {
  const { lang, t } = useI18n();

  const timelineData = useMemo(() => {
    const normalisedBucket = (
      value: number | null,
      total: number
    ): number | null =>
      value !== null && total > 0 ? roundNum((value / total) * 100, 1) : null;

    return allDays.map((d) => {
      const rawBuckets = [
        d.restStressPct,
        d.lowStressPct,
        d.mediumStressPct,
        d.highStressPct,
      ];
      const stressBucketTotal = rawBuckets.reduce(
        (acc: number, v) => acc + (typeof v === 'number' ? v : 0),
        0
      );

      return {
        date: d.calendarDate,
        formattedDate: formatDateDDMMYYYYWithWeekday(d.calendarDate, lang, 'short'),
        asleepBaselineHr: d.asleepBaselineHr !== null ? Math.round(d.asleepBaselineHr) : null,
        restingHr: d.restingHr !== null ? Math.round(d.restingHr) : null,
        daytimeSeatedHr: d.daytimeSeatedHr !== null ? Math.round(d.daytimeSeatedHr) : null,
        deltaSeatedHr: roundNum(d.flags.deltaSeatedHrBpm, 1),
        alertMarker:
          d.abnormalHrAlertsCount > 0 ? Math.round(d.daytimeSeatedHr ?? 92) : null,
        hrvNightAvg: d.hrvNightAvg !== null ? Math.round(d.hrvNightAvg) : null,
        hrvWeeklyAvg: d.hrvWeeklyAvg !== null ? Math.round(d.hrvWeeklyAvg) : null,
        earlyNightHrvAvg: d.earlyNightHrvAvg !== null ? Math.round(d.earlyNightHrvAvg) : null,
        lateNightHrvAvg: d.lateNightHrvAvg !== null ? Math.round(d.lateNightHrvAvg) : null,
        sleepStressAvg: d.sleepStressAvg !== null ? Math.round(d.sleepStressAvg) : null,
        stressAvg: d.stressAvg !== null ? Math.round(d.stressAvg) : null,
        stressMax: d.stressMax !== null ? Math.round(d.stressMax) : null,
        // Garmin's rest/low/medium/high stress-time buckets, normalised to 100%
        // over the bucket values present (they already sum to ~100 for days with
        // a full stress summary; normalising keeps partial days on a common scale)
        restPct: normalisedBucket(d.restStressPct, stressBucketTotal),
        lowPct: normalisedBucket(d.lowStressPct, stressBucketTotal),
        mediumPct: normalisedBucket(d.mediumStressPct, stressBucketTotal),
        highPct: normalisedBucket(d.highStressPct, stressBucketTotal),
        balancedLow: d.hrvBaseline?.balancedLow ?? 36,
        balancedUpper: d.hrvBaseline?.balancedUpper ?? 48,
      };
    });
  }, [allDays, lang]);

  const cutoffScatterData = useMemo(() => {
    const pts: {
      date: string;
      formattedDate: string;
      hoursBeforeBed: number;
      earlyNightHrvAvg: number;
      lateNightHrvAvg: number;
      sleepStressAvg: number;
      lastDoseTime: string;
      carryoverFlag: boolean;
    }[] = [];

    for (let i = 1; i < allDays.length; i++) {
      const wakeDay = allDays[i];
      const prevDay = allDays[i - 1];
      const prevLog = dayLogs[prevDay.calendarDate];
      if (!prevLog) continue;

      const doses = prevLog.events
        .filter((e) => e.type === 'DOSE')
        .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
      if (!doses.length || !wakeDay.sleepStartLocal) continue;

      const lastDose = doses[doses.length - 1];
      const sleepStartMin = hhmmToMinute(wakeDay.sleepStartLocal);
      const adjustedSleepMin = sleepStartMin < 720 ? sleepStartMin + 1440 : sleepStartMin;
      const hoursBeforeBed =
        Math.round(((adjustedSleepMin - lastDose.minuteOfDay) / 60) * 10) / 10;

      if (
        hoursBeforeBed > 1 &&
        hoursBeforeBed < 18 &&
        wakeDay.earlyNightHrvAvg !== null &&
        wakeDay.sleepStressAvg !== null
      ) {
        pts.push({
          date: wakeDay.calendarDate,
          formattedDate: formatDateDDMMYYYYWithWeekday(wakeDay.calendarDate, lang, 'short'),
          hoursBeforeBed,
          earlyNightHrvAvg: Math.round(wakeDay.earlyNightHrvAvg),
          lateNightHrvAvg: Math.round(wakeDay.lateNightHrvAvg ?? 44),
          sleepStressAvg: Math.round(wakeDay.sleepStressAvg),
          lastDoseTime: lastDose.timeLocal,
          carryoverFlag: wakeDay.flags.lateDoseCarryoverWarning,
        });
      }
    }
    return pts;
  }, [allDays, dayLogs, lang]);

  const safetyStats = useMemo(() => {
    const alertDays = allDays.filter((d) => d.abnormalHrAlertsCount > 0);
    const carryoverDays = allDays.filter((d) => d.flags.lateDoseCarryoverWarning);
    const earlyCutoffPts = cutoffScatterData.filter((p) => p.hoursBeforeBed >= 8.5);
    const lateCutoffPts = cutoffScatterData.filter((p) => p.hoursBeforeBed < 7.5);

    const avgEarlyHrvWhenSafeCutoff = earlyCutoffPts.length
      ? Math.round(
          earlyCutoffPts.reduce((a, p) => a + p.earlyNightHrvAvg, 0) / earlyCutoffPts.length
        )
      : null;
    const avgEarlyHrvWhenLateDose = lateCutoffPts.length
      ? Math.round(
          lateCutoffPts.reduce((a, p) => a + p.earlyNightHrvAvg, 0) / lateCutoffPts.length
        )
      : null;

    const sleepHrs = allDays
      .map((d) => d.asleepBaselineHr)
      .filter((n): n is number => typeof n === 'number');
    const avgSleepHr = sleepHrs.length
      ? Math.round(sleepHrs.reduce((a, b) => a + b, 0) / sleepHrs.length)
      : null;

    return {
      alertDaysCount: alertDays.length,
      carryoverDaysCount: carryoverDays.length,
      avgEarlyHrvWhenSafeCutoff,
      avgEarlyHrvWhenLateDose,
      avgSleepHr,
    };
  }, [allDays, cutoffScatterData]);

  // Balanced band reference from most recent day with baseline
  const latestBaseline = useMemo(() => {
    for (let i = allDays.length - 1; i >= 0; i--) {
      const b = allDays[i].hrvBaseline;
      if (b?.balancedLow && b?.balancedUpper) return b;
    }
    return { balancedLow: 36, balancedUpper: 48 };
  }, [allDays]);

  // Regimen era spans drawn as shaded bands behind both time-series charts.
  // The XAxis is a category axis keyed by formattedDate, and Recharts silently
  // drops a ReferenceArea whenever its x1/x2 value is not an exact category in
  // the chart data — e.g. when an era boundary falls on a day with no Garmin
  // data (missed syncs, watch off). So every span endpoint is clamped to the
  // nearest day that actually exists in the dataset; a span covering no data
  // day at all is skipped.
  // Formatted exactly like the XAxis category labels ("22/10/2026 (Thu)") so
  // ReferenceArea lookup matches.
  const eraSpans = useMemo(() => {
    if (!allDays.length || !regimenEras.length) return [];
    let firstDate = allDays[0].calendarDate;
    let lastDate = firstDate;
    for (const d of allDays) {
      if (d.calendarDate < firstDate) firstDate = d.calendarDate;
      if (d.calendarDate > lastDate) lastDate = d.calendarDate;
    }
    const firstDayOnOrAfter = (date: string): string | undefined => {
      let match: string | undefined;
      for (const d of allDays) {
        if (d.calendarDate >= date && (match === undefined || d.calendarDate < match)) {
          match = d.calendarDate;
        }
      }
      return match;
    };
    const lastDayOnOrBefore = (date: string): string | undefined => {
      let match: string | undefined;
      for (const d of allDays) {
        if (d.calendarDate <= date && (match === undefined || d.calendarDate > match)) {
          match = d.calendarDate;
        }
      }
      return match;
    };
    const spans: { id: string; color: string; x1: string; x2: string; label: string }[] = [];
    const usedColors = new Set<string>();
    for (const era of regimenEras) {
      const start = era.startDate < firstDate ? firstDate : era.startDate;
      const end = era.endDate === '2099-12-31' || era.endDate > lastDate ? lastDate : era.endDate;
      const startDay = firstDayOnOrAfter(start);
      const endDay = lastDayOnOrBefore(end);
      if (!startDay || !endDay || endDay < startDay) continue;
      spans.push({
        id: era.id,
        color: resolveUniqueRegimenColor(era.color, era.id, usedColors),
        x1: formatDateDDMMYYYYWithWeekday(startDay, lang, 'short'),
        x2: formatDateDDMMYYYYWithWeekday(endDay, lang, 'short'),
        label: translateEraTitle(era.id, era.title, lang),
      });
    }
    return spans;
  }, [allDays, regimenEras, lang]);

  const renderEraSpans = () =>
    eraSpans.map((era) => (
      <ReferenceArea
        key={`era-${era.id}`}
        x1={era.x1}
        x2={era.x2}
        ifOverflow="visible"
        fill={era.color}
        fillOpacity={0.06}
        stroke={era.color}
        strokeOpacity={0.3}
        strokeDasharray="4 4"
        label={{
          value: era.label,
          position: 'insideTopLeft',
          fill: era.color,
          fontSize: 10,
        }}
      />
    ));

  return (
    <div className="space-y-6">
      {/* Top 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1 font-medium">
              {t('trendsKpi1Title')}
              <InfoTooltip text={t('trendsKpi1Tooltip')} />
            </span>
            <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {safetyStats.avgSleepHr ?? '—'}{' '}
            <span className="text-xs font-normal text-slate-500">
              bpm ({t('trendsKpi1Value')})
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t('trendsKpi1Sub', { count: allDays.length })}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1 font-medium">
              {t('trendsKpi2Title')}
              <InfoTooltip text={t('trendsKpi2Tooltip')} />
            </span>
            <Moon className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {safetyStats.avgEarlyHrvWhenSafeCutoff ?? '—'}{' '}
            <span className="text-xs font-normal text-slate-500">ms</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t('trendsKpi2Sub')}</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1 font-medium">
              {t('trendsKpi3Title')}
              <InfoTooltip text={t('trendsKpi3Tooltip')} />
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-700">
            {safetyStats.avgEarlyHrvWhenLateDose ?? '—'}{' '}
            <span className="text-xs font-normal text-slate-500">ms</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t('trendsKpi3Sub', { count: safetyStats.carryoverDaysCount })}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1 font-medium">
              {t('trendsKpi4Title')}
              <InfoTooltip text={t('trendsKpi4Tooltip')} />
            </span>
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {safetyStats.alertDaysCount}
          </div>
          <p className="mt-1 text-xs text-slate-500">{t('trendsKpi4Sub')}</p>
        </div>
      </div>

      {/* Chart 1: Heart Rate + All-Day Stress, stacked with synchronised hover.
          Both panels share the same data array and Recharts `syncId`, so the
          tooltip cursor ("vertical bar") is always aligned across the two —
          hover anywhere on one panel to line up the same day on the other. */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-600" />
              {t('trendsHrChartTitle')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('trendsHrChartSub')}</p>
          </div>
        </div>

        {/* Top panel: Heart Rate */}
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={timelineData}
              syncId="trends-hr-stress"
              margin={{ top: 14, right: 16, left: 0, bottom: 2 }}
              onClick={(state) => {
                if (state && state.activePayload && state.activePayload[0]?.payload?.date) {
                  onSelectDateAndJump(state.activePayload[0].payload.date);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              {/* X axis is labelled once, on the stress panel below, so the two
                  panels read as one continuous timeline (hidden axis keeps the
                  category mapping + synchronised hover cursor working). */}
              <XAxis
                dataKey="formattedDate"
                hide
                interval={7}
              />
              <YAxis
                domain={[46, 100]}
                stroke="#94a3b8"
                tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                unit=" bpm"
                width={64}
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

              {renderEraSpans()}

              <Line
                type="monotone"
                dataKey="daytimeSeatedHr"
                name={t('kpiDaytimeHrTitle')}
                stroke="#d97706"
                strokeWidth={2}
                dot={{ r: 2, fill: '#d97706' }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="restingHr"
                name={t('legendGarminRhr')}
                stroke="#64748b"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="asleepBaselineHr"
                name={t('kpiSleepingHrTitle')}
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 2, fill: '#2563eb' }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="alertMarker"
                name={t('trendsKpi4Title')}
                stroke="#e11d48"
                strokeWidth={0}
                dot={{ r: 5, fill: '#e11d48', stroke: '#ffe4e6', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Bottom panel: Garmin all-day stress (avg area + max dashed line) */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-violet-600" />
            {t('trendsStressChartTitle')}
            <InfoTooltip text={t('trendsStressTooltip')} />
          </h3>
        </div>
        <div className="h-[170px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={timelineData}
              syncId="trends-hr-stress"
              margin={{ top: 6, right: 16, left: 0, bottom: 8 }}
              onClick={(state) => {
                if (state && state.activePayload && state.activePayload[0]?.payload?.date) {
                  onSelectDateAndJump(state.activePayload[0].payload.date);
                }
              }}
            >
              <defs>
                <linearGradient id="stressAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="formattedDate"
                stroke="#94a3b8"
                tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                interval={7}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                stroke="#94a3b8"
                tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                width={64}
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
              <Legend wrapperStyle={{ fontSize: '11px' }} />

              {renderEraSpans()}

              {/* Daily stacked histogram: how Garmin's measured time split
                  across rest / low / medium / high stress buckets. One column
                  per day, 0-100%, drawn beneath the avg/max curves. Colors are
                  a severity ramp (slate -> emerald -> amber -> rose) chosen so
                  nothing competes with the violet avg/max curve above. */}
              <Bar
                dataKey="restPct"
                name={t('stressRestLabel')}
                stackId="stressDist"
                fill="#cbd5e1"
                maxBarSize={16}
                isAnimationActive={false}
              />
              <Bar
                dataKey="lowPct"
                name={t('stressLowLabel')}
                stackId="stressDist"
                fill="#34d399"
                maxBarSize={16}
                isAnimationActive={false}
              />
              <Bar
                dataKey="mediumPct"
                name={t('stressMediumLabel')}
                stackId="stressDist"
                fill="#fbbf24"
                maxBarSize={16}
                isAnimationActive={false}
              />
              <Bar
                dataKey="highPct"
                name={t('stressHighLabel')}
                stackId="stressDist"
                fill="#fb7185"
                maxBarSize={16}
                isAnimationActive={false}
              />

              <Area
                type="monotone"
                dataKey="stressAvg"
                name={t('legendStressAvg')}
                stroke="#7c3aed"
                strokeWidth={1.8}
                fill="url(#stressAreaFill)"
                fillOpacity={0.16}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="stressMax"
                name={t('legendStressMax')}
                stroke="#a78bfa"
                strokeWidth={1.2}
                strokeDasharray="4 3"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom 2-Column Grid: HRV Trend + Dose Cutoff Scatter */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 2: Overnight HRV Over Time */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                {t('trendsHrvChartTitle')}
                <InfoTooltip text={t('chartHrvTooltip')} />
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{t('trendsHrvChartSub')}</p>
            </div>
          </div>

          <p className="text-xs text-emerald-800 bg-emerald-50/70 border border-emerald-200/80 rounded-lg px-3 py-1.5">
            {t('balancedBandNote', {
              low: formatNum(latestBaseline.balancedLow, 0),
              high: formatNum(latestBaseline.balancedUpper, 0),
            })}
          </p>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={timelineData}
                margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
                onClick={(state) => {
                  if (state && state.activePayload && state.activePayload[0]?.payload?.date) {
                    onSelectDateAndJump(state.activePayload[0].payload.date);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="formattedDate"
                  stroke="#94a3b8"
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  interval={9}
                />
                <YAxis
                  domain={[15, 100]}
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
                <Legend wrapperStyle={{ fontSize: '11px' }} />

                {renderEraSpans()}

                {latestBaseline.balancedLow && latestBaseline.balancedUpper && (
                  <ReferenceArea
                    y1={latestBaseline.balancedLow}
                    y2={latestBaseline.balancedUpper}
                    fill="#10b981"
                    fillOpacity={0.14}
                  />
                )}

                <Line
                  type="monotone"
                  dataKey="lateNightHrvAvg"
                  name={t('legendSecondHalfHrv')}
                  stroke="#059669"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="earlyNightHrvAvg"
                  name={t('legendFirstHalfHrv')}
                  stroke="#d97706"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="hrvWeeklyAvg"
                  name={t('legendWeeklyAvgHrv')}
                  stroke="#2563eb"
                  strokeWidth={2.2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Last Dose -> Bedtime Scatter */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              {t('trendsCutoffTitle')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{t('trendsCutoffSub')}</p>
          </div>

          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 16, left: 0, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="hoursBeforeBed"
                  name={t('axisHoursBeforeSleep')}
                  domain={[4, 15]}
                  unit="h"
                  stroke="#94a3b8"
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  type="number"
                  dataKey="earlyNightHrvAvg"
                  name={t('legendFirstHalfHrv')}
                  domain={[20, 90]}
                  unit=" ms"
                  stroke="#94a3b8"
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  width={54}
                />
                <ZAxis
                  type="number"
                  dataKey="sleepStressAvg"
                  range={[45, 140]}
                  name={t('axisSleepStress')}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#0f172a',
                  }}
                />
                <ReferenceLine
                  x={8.5}
                  stroke="#059669"
                  strokeDasharray="4 4"
                  label={{
                    value: '≥8.5h',
                    position: 'insideTopRight',
                    fill: '#047857',
                    fontSize: 11,
                  }}
                />
                <Scatter
                  name={t('scatterLoggedDays')}
                  data={cutoffScatterData}
                  fill="#d97706"
                  onClick={(pt) => {
                    if (pt && pt.date) onSelectDateAndJump(pt.date);
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
            {t('trendsCutoffTakeaway')}
          </div>
        </div>
      </div>
    </div>
  );
};

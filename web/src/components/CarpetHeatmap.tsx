import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Dumbbell,
  ExternalLink,
  Filter,
  Grid,
  Pill,
  ShieldAlert,
} from 'lucide-react';
import type { DayLogDoc, DaySummaryDoc, RegimenEraDoc } from '../types';
import {
  formatBpm,
  formatDateDDMMYYYY,
  formatDateDDMMYYYYWithWeekday,
  formatDeltaBpm,
} from '../utils/format';
import { translateEraTitle, useI18n } from '../i18n';
import { resolveRegimenColor } from '../utils/regimenColors';

interface CarpetHeatmapProps {
  allDays: DaySummaryDoc[];
  dayLogs: Record<string, DayLogDoc>;
  regimenEras: RegimenEraDoc[];
  selectedDate: string;
  onSelectDateAndJump: (date: string) => void;
}

function getBpmCellStyle(bpm: number | null): { bg: string; text: string } {
  if (bpm === null || bpm === undefined) {
    return { bg: '#f8fafc', text: '#94a3b8' };
  }
  if (bpm <= 56) return { bg: '#e0f2fe', text: '#0369a1' }; // Cool sky
  if (bpm <= 62) return { bg: '#f0f9ff', text: '#0284c7' }; // Soft blue
  if (bpm <= 68) return { bg: '#ecfdf5', text: '#047857' }; // Calm emerald
  if (bpm <= 75) return { bg: '#fefce8', text: '#a16207' }; // Mild yellow
  if (bpm <= 84) return { bg: '#fef3c7', text: '#b45309' }; // Warm amber
  if (bpm <= 95) return { bg: '#ffedd5', text: '#c2410c' }; // Orange
  return { bg: '#ffe4e6', text: '#be123c' }; // Rose (95+ bpm)
}

export const CarpetHeatmap: React.FC<CarpetHeatmapProps> = ({
  allDays,
  dayLogs,
  regimenEras,
  selectedDate,
  onSelectDateAndJump,
}) => {
  const { lang, t } = useI18n();
  const [excludeWorkouts, setExcludeWorkouts] = useState<boolean>(true);
  const [selectedEraId, setSelectedEraId] = useState<string>('all');

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const filteredDays = useMemo(() => {
    const list = allDays.filter((d) => {
      if (selectedEraId === 'all') return true;
      const era = regimenEras.find((e) => e.id === selectedEraId);
      if (!era) return true;
      return d.calendarDate >= era.startDate && d.calendarDate <= era.endDate;
    });
    return list.slice().reverse();
  }, [allDays, regimenEras, selectedEraId]);

  const getEraForDate = (date: string): RegimenEraDoc | undefined =>
    regimenEras.find((e) => date >= e.startDate && date <= e.endDate);

  const aggregateHourlyMeans = useMemo(() => {
    return hours.map((h) => {
      const vals: number[] = [];
      for (const d of filteredDays) {
        const arr = excludeWorkouts ? d.hourlySeatedHrLocal : d.hourlyHrLocal;
        const v = arr?.[h];
        if (typeof v === 'number') vals.push(v);
      }
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    });
  }, [filteredDays, excludeWorkouts]);

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Grid className="w-5 h-5 text-blue-600" />
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">
              {t('heatmapTitle')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">{t('heatmapSubtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeWorkouts}
              onChange={(e) => setExcludeWorkouts(e.target.checked)}
              className="rounded accent-blue-600 w-4 h-4 cursor-pointer"
            />
            <span>{t('excludeWorkoutsToggle')}</span>
          </label>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedEraId}
              onChange={(e) => setSelectedEraId(e.target.value)}
              aria-label="Filter by Period"
              className="bg-transparent text-slate-800 font-medium focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-white">
                {t('allPeriodsOption', { count: allDays.length })}
              </option>
              {regimenEras.map((era) => (
                <option key={era.id} value={era.id} className="bg-white">
                  {translateEraTitle(era.id, era.title, lang)} (
                  {formatDateDDMMYYYY(era.startDate, t('present'))} →{' '}
                  {formatDateDDMMYYYY(era.endDate, t('present'))})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Color Scale Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-xs text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-600 font-medium mr-1">{t('bpmScaleLabel')}</span>
          {[
            { label: t('scaleSleep'), bpm: 54 },
            { label: '57–62', bpm: 60 },
            { label: '63–68', bpm: 66 },
            { label: '69–75', bpm: 72 },
            { label: t('scaleMedicated'), bpm: 80 },
            { label: '85–95', bpm: 90 },
            { label: t('scalePeak'), bpm: 102 },
          ].map((item) => {
            const st = getBpmCellStyle(item.bpm);
            return (
              <span
                key={item.label}
                className="px-2 py-0.5 rounded font-mono text-[11px] border border-slate-200/60"
                style={{ backgroundColor: st.bg, color: st.text }}
              >
                {item.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* 2D Hourly Table */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[650px]">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-[11px] font-mono text-slate-600">
              <tr>
                <th className="py-2.5 px-3 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 min-w-[115px]">
                  {t('colDate')}
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-200 min-w-[145px]">
                  {t('colPeriod')}
                </th>
                <th className="py-2.5 px-2 text-center border-r border-slate-200">
                  {t('colSleepHr')}
                </th>
                <th className="py-2.5 px-2 text-center border-r border-slate-200">
                  {t('colSeatedHr')}
                </th>
                <th className="py-2.5 px-2 text-center border-r border-slate-200">
                  {t('colDeltaHr')}
                </th>
                {hours.map((h) => {
                  const isBaselineHour = h >= 4 && h <= 6;
                  const isDaytimeHour = h >= 9 && h <= 16;
                  return (
                    <th
                      key={h}
                      className={`py-2 px-1 text-center min-w-[34px] border-r border-slate-200/60 ${
                        isBaselineHour
                          ? 'bg-blue-50 text-blue-700'
                          : isDaytimeHour
                          ? 'bg-amber-50 text-amber-800'
                          : ''
                      }`}
                    >
                      {String(h).padStart(2, '0')}h
                    </th>
                  );
                })}
                <th className="py-2.5 px-2.5 text-center">{t('colEvents')}</th>
              </tr>

              {/* Mean Row */}
              <tr className="bg-slate-100/90 border-b border-slate-200 font-semibold text-slate-800">
                <td className="py-1.5 px-3 sticky left-0 z-30 bg-slate-100 border-r border-slate-200 text-xs">
                  {t('meanRowLabel', { count: filteredDays.length })}
                </td>
                <td className="py-1.5 px-2.5 border-r border-slate-200 text-[11px] text-slate-500">
                  {excludeWorkouts ? t('seatedOnlyLabel') : t('allReadingsLabel')}
                </td>
                <td className="py-1.5 px-2 text-center border-r border-slate-200 text-blue-700">
                  {filteredDays.length
                    ? Math.round(
                        filteredDays.reduce((a, d) => a + (d.asleepBaselineHr ?? 56), 0) /
                          filteredDays.length
                      )
                    : '—'}
                </td>
                <td className="py-1.5 px-2 text-center border-r border-slate-200 text-amber-800">
                  {filteredDays.length
                    ? Math.round(
                        filteredDays.reduce((a, d) => a + (d.daytimeSeatedHr ?? 70), 0) /
                          filteredDays.length
                      )
                    : '—'}
                </td>
                <td className="py-1.5 px-2 text-center border-r border-slate-200 text-slate-500">
                  —
                </td>
                {aggregateHourlyMeans.map((val, h) => {
                  const st = getBpmCellStyle(val);
                  return (
                    <td
                      key={h}
                      className="py-1.5 px-1 text-center text-[11px] border-r border-slate-200/50"
                      style={{ backgroundColor: st.bg, color: st.text }}
                    >
                      {val ?? '—'}
                    </td>
                  );
                })}
                <td className="py-1.5 px-2 text-center text-[10px] text-slate-500">—</td>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200/70 font-mono text-xs">
              {filteredDays.map((day) => {
                const era = getEraForDate(day.calendarDate);
                const log = dayLogs[day.calendarDate];
                const doseCount =
                  log?.events.filter((e) => e.type === 'DOSE').length ?? 0;
                const isSelected = day.calendarDate === selectedDate;
                const hourlyArr = excludeWorkouts
                  ? day.hourlySeatedHrLocal
                  : day.hourlyHrLocal;
                const fmtDate = formatDateDDMMYYYY(day.calendarDate, t('present'));
                const fmtDateWeekday = formatDateDDMMYYYYWithWeekday(
                  day.calendarDate,
                  lang,
                  'short',
                  t('present')
                );

                return (
                  <tr
                    key={day.calendarDate}
                    onClick={() => onSelectDateAndJump(day.calendarDate)}
                    className={`group transition cursor-pointer ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-1.5 px-3 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 font-semibold text-slate-800 whitespace-nowrap">
                      <span className="flex items-center justify-between gap-1">
                        <span>{fmtDateWeekday}</span>
                        <ExternalLink className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                      </span>
                    </td>

                    <td className="py-1.5 px-2.5 border-r border-slate-200 font-sans text-[11px] truncate max-w-[160px] text-slate-600">
                      {era ? (
                        <span className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: resolveRegimenColor(era.color, era.id) }}
                          />
                          <span className="truncate">
                            {translateEraTitle(era.id, era.title, lang)}
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="py-1.5 px-2 text-center border-r border-slate-200 text-blue-700">
                      {formatBpm(day.asleepBaselineHr)}
                    </td>

                    <td className="py-1.5 px-2 text-center border-r border-slate-200 font-semibold text-slate-900">
                      {formatBpm(day.daytimeSeatedHr)}
                    </td>

                    <td className="py-1.5 px-2 text-center border-r border-slate-200">
                      {day.flags.deltaSeatedHrBpm !== null ? (
                        <span
                          className={
                            day.flags.deltaHrExceeds20
                              ? 'text-rose-600 font-bold'
                              : 'text-amber-700'
                          }
                        >
                          {formatDeltaBpm(day.flags.deltaSeatedHrBpm, 0)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {hours.map((h) => {
                      const rawBpm = hourlyArr?.[h] ?? null;
                      const bpm = rawBpm !== null ? Math.round(rawBpm) : null;
                      const st = getBpmCellStyle(bpm);
                      return (
                        <td
                          key={h}
                          className="py-1.5 px-1 text-center text-[11px] border-r border-slate-200/40"
                          style={{ backgroundColor: st.bg, color: st.text }}
                          title={`${fmtDate} ${String(h).padStart(2, '0')}:00 — ${bpm ?? '—'} bpm`}
                        >
                          {bpm ?? ''}
                        </td>
                      );
                    })}

                    <td className="py-1.5 px-2.5 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        {doseCount > 0 && (
                          <span
                            className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                            title={`${doseCount} ${doseCount === 1 ? 'dose' : 'doses'}`}
                          >
                            <Pill className="w-3 h-3 mr-0.5 text-amber-600" />
                            {doseCount}
                          </span>
                        )}
                        {day.workouts.length > 0 && (
                          <span
                            className="text-emerald-600"
                            title={day.workouts.map((w) => w.activityName).join(', ')}
                          >
                            <Dumbbell className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {day.flags.lateDoseCarryoverWarning && (
                          <span className="text-amber-600" title={t('lateCarryoverBadge')}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {day.flags.hasAbnormalHrAlert && (
                          <span className="text-rose-600" title={t('trendsKpi4Title')}>
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

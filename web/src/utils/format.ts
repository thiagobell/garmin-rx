/**
 * Date and number formatting utilities.
 * Enforces DD/MM/YYYY date formatting everywhere, clean decimal rounding,
 * and weekday labels next to dates (e.g. 22/10/2026 (Thursday) / 22/10/2026 (Quinta-feira)).
 */

import type { Language } from '../i18n';

const WEEKDAYS: Record<Language, { long: string[]; short: string[] }> = {
  en: {
    long: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
  pt: {
    long: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'],
    short: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  },
};

export function formatDateDDMMYYYY(isoDate: string | null | undefined, presentLabel = 'Present'): string {
  if (!isoDate) return '—';
  if (isoDate === '2099-12-31') return presentLabel;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate;
  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Weekday index (0 = Sunday) for a "YYYY-MM-DD" date.
 * Uses midday UTC so the result never depends on the viewer's browser timezone —
 * a calendar date is the same weekday no matter where in the world it is viewed.
 */
function weekdayIndex(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return -1;
  const [, yyyy, mm, dd] = match;
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 12)).getUTCDay();
}

/**
 * DD/MM/YYYY with weekday label.
 * style: 'long'  -> 22/10/2026 (Thursday) / 22/10/2026 (Quinta-feira)
 * style: 'short' -> 22/10/2026 (Thu)      / 22/10/2026 (Qui)
 */
export function formatDateDDMMYYYYWithWeekday(
  isoDate: string | null | undefined,
  lang: Language,
  style: 'long' | 'short' = 'long',
  presentLabel = 'Present'
): string {
  if (!isoDate) return '—';
  if (isoDate === '2099-12-31') return presentLabel;
  const idx = weekdayIndex(isoDate);
  if (idx < 0) return formatDateDDMMYYYY(isoDate, presentLabel);
  return `${formatDateDDMMYYYY(isoDate, presentLabel)} (${WEEKDAYS[lang][style][idx]})`;
}

export function roundNum(val: number | null | undefined, decimals = 1): number | null {
  if (val === null || val === undefined || Number.isNaN(val)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export function formatNum(val: number | null | undefined, decimals = 1): string {
  const r = roundNum(val, decimals);
  if (r === null) return '—';
  return Number(r.toFixed(decimals)).toString();
}

export function formatBpm(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return String(Math.round(val));
}

export function formatDeltaBpm(val: number | null | undefined, decimals = 1): string {
  const r = roundNum(val, decimals);
  if (r === null) return '—';
  const clean = Number(r.toFixed(decimals)).toString();
  return r > 0 ? `+${clean}` : clean;
}

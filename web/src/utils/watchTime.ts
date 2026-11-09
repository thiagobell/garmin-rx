/**
 * Watch-local time helpers.
 *
 * Golden rule: every time shown in this dashboard is in the **watch-local**
 * timezone of the recording (the timezone the Garmin watch was in when the
 * data was captured) — never the viewer's browser timezone. A guest opening
 * the dashboard from another timezone (e.g. a doctor 12 hours away) sees the
 * exact same wall-clock times the owner experienced.
 *
 * `DaySummaryDoc.timezoneOffsetHours` (e.g. +2 for UTC+2) is the watch-recorded
 * offset, so we use the most recent synced day's offset to compute the
 * watch-local "now" — which lets Today be selectable for logging even before
 * the scheduled Garmin sync has created the day's document.
 */

export interface HasDateAndOffset {
  calendarDate: string;
  timezoneOffsetHours: number;
}

/** Most recent synced day's watch-recorded UTC offset in hours (null if no days). */
export function getLatestWatchOffsetHours<T extends HasDateAndOffset>(allDays: T[]): number | null {
  for (let i = allDays.length - 1; i >= 0; i--) {
    if (typeof allDays[i].timezoneOffsetHours === 'number' && Number.isFinite(allDays[i].timezoneOffsetHours)) {
      return allDays[i].timezoneOffsetHours;
    }
  }
  return null;
}

/**
 * Current watch-local date as "YYYY-MM-DD".
 * Uses the latest synced day's watch offset; falls back to the browser's
 * offset (only relevant for the owner logging from the same timezone as the watch).
 */
export function watchTodayISO<T extends HasDateAndOffset>(allDays: T[]): string {
  const offsetHours =
    getLatestWatchOffsetHours(allDays) ?? -new Date().getTimezoneOffset() / 60;
  const watchNow = new Date(Date.now() + offsetHours * 3600000);
  return watchNow.toISOString().slice(0, 10);
}

/** Current watch-local time as "HH:MM" (same offset logic as `watchTodayISO`). */
export function watchNowHHMM<T extends HasDateAndOffset>(allDays: T[]): string {
  const offsetHours =
    getLatestWatchOffsetHours(allDays) ?? -new Date().getTimezoneOffset() / 60;
  const watchNow = new Date(Date.now() + offsetHours * 3600000);
  return `${String(watchNow.getUTCHours()).padStart(2, '0')}:${String(
    watchNow.getUTCMinutes()
  ).padStart(2, '0')}`;
}

/** Browser-local "YYYY-MM-DD" — initial guess before any synced data arrives. */
export function browserTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

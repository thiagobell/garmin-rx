import {
  DaySummaryDoc,
  HrvBaseline,
  IntradayDetailsDoc,
  ProcessedDayResult,
  RawGarminDailyPayload,
  WorkoutSummary,
} from "./types";

interface TimeAnchor {
  utcMs: number;
  offsetMs: number;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function avgOrNull(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return round1(sum / values.length);
}

/**
 * Parses an ISO-like timestamp string ("2026-10-19T22:00:00.0" or "2026-10-08 13:09:33")
 * strictly as UTC epoch milliseconds, NEVER using the host OS timezone.
 */
export function parseIsoAsUtcMs(tsStr: string | null | undefined): number | null {
  if (!tsStr || typeof tsStr !== "string") return null;
  const trimmed = tsStr.trim();
  if (!trimmed) return null;
  // Normalize space separator to 'T' and strip trailing Z if present before re-adding Z
  const normalized = trimmed.replace(" ", "T").replace(/Z$/i, "");
  const ms = Date.parse(`${normalized}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Formats a shifted local epoch millisecond value (utcMs + offsetMs) into wall-clock
 * components using UTC getters so the host OS timezone never affects the output.
 */
export function formatLocalEpochMs(localEpochMs: number): {
  dateStr: string;
  timeHm: string;
  dateTimeSpace: string;
  isoLocal: string;
  hour: number;
  minute: number;
  minuteOfDay: number;
} {
  const d = new Date(localEpochMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hourNum = d.getUTCHours();
  const minNum = d.getUTCMinutes();
  const secNum = d.getUTCSeconds();

  const hh = String(hourNum).padStart(2, "0");
  const mm = String(minNum).padStart(2, "0");
  const ss = String(secNum).padStart(2, "0");

  const dateStr = `${year}-${month}-${day}`;
  const timeHm = `${hh}:${mm}`;
  const dateTimeSpace = `${dateStr} ${hh}:${mm}:${ss}`;
  const isoLocal = `${dateStr}T${hh}:${mm}:${ss}`;

  return {
    dateStr,
    timeHm,
    dateTimeSpace,
    isoLocal,
    hour: hourNum,
    minute: minNum,
    minuteOfDay: hourNum * 60 + minNum,
  };
}

/**
 * Builds watch-recorded timezone offset anchors from all GMT/Local timestamp pairs in a daily payload.
 */
export function buildWatchTimeAnchors(payload: RawGarminDailyPayload): TimeAnchor[] {
  const anchors: TimeAnchor[] = [];

  const addIsoPair = (gmtStr?: string | null, localStr?: string | null) => {
    const gmtMs = parseIsoAsUtcMs(gmtStr);
    const localMs = parseIsoAsUtcMs(localStr);
    if (gmtMs !== null && localMs !== null) {
      // Round offset to nearest minute (60,000 ms) to avoid any sub-second drift
      const rawOffset = localMs - gmtMs;
      const offsetMs = Math.round(rawOffset / 60000) * 60000;
      anchors.push({ utcMs: gmtMs, offsetMs });
    }
  };

  // 1. intraday_heart_rate
  const hr = payload.intraday_heart_rate;
  if (hr && typeof hr === "object") {
    addIsoPair(hr.startTimestampGMT, hr.startTimestampLocal);
    addIsoPair(hr.endTimestampGMT, hr.endTimestampLocal);
  }

  // 2. user_summary
  const u = payload.user_summary;
  if (u && typeof u === "object") {
    addIsoPair(u.wellnessStartTimeGmt, u.wellnessStartTimeLocal);
    addIsoPair(u.wellnessEndTimeGmt, u.wellnessEndTimeLocal);
    addIsoPair(u.latestSpo2ReadingTimeGmt, u.latestSpo2ReadingTimeLocal);
    if (Array.isArray(u.bodyBatteryActivityEventList)) {
      for (const ev of u.bodyBatteryActivityEventList) {
        const gmtMs = parseIsoAsUtcMs(ev?.eventStartTimeGmt);
        if (gmtMs !== null && typeof ev?.timezoneOffset === "number") {
          anchors.push({ utcMs: gmtMs, offsetMs: ev.timezoneOffset });
        }
      }
    }
  }

  // 3. body_battery
  const bbRaw = Array.isArray(payload.body_battery)
    ? payload.body_battery[0]
    : payload.body_battery;
  if (bbRaw && typeof bbRaw === "object") {
    addIsoPair(bbRaw.startTimestampGMT, bbRaw.startTimestampLocal);
    addIsoPair(bbRaw.endTimestampGMT, bbRaw.endTimestampLocal);
    if (Array.isArray(bbRaw.bodyBatteryActivityEvent)) {
      for (const ev of bbRaw.bodyBatteryActivityEvent) {
        const gmtMs = parseIsoAsUtcMs(ev?.eventStartTimeGmt);
        if (gmtMs !== null && typeof ev?.timezoneOffset === "number") {
          anchors.push({ utcMs: gmtMs, offsetMs: ev.timezoneOffset });
        }
      }
    }
  }

  // 4. detailed_sleep
  const slp = payload.detailed_sleep;
  if (slp && typeof slp === "object") {
    if (
      typeof slp.sleepStartTimestampGMT === "number" &&
      typeof slp.sleepStartTimestampLocal === "number"
    ) {
      const offsetMs =
        Math.round((slp.sleepStartTimestampLocal - slp.sleepStartTimestampGMT) / 60000) *
        60000;
      anchors.push({ utcMs: slp.sleepStartTimestampGMT, offsetMs });
    }
    if (
      typeof slp.sleepEndTimestampGMT === "number" &&
      typeof slp.sleepEndTimestampLocal === "number"
    ) {
      const offsetMs =
        Math.round((slp.sleepEndTimestampLocal - slp.sleepEndTimestampGMT) / 60000) *
        60000;
      anchors.push({ utcMs: slp.sleepEndTimestampGMT, offsetMs });
    }
  }

  // 5. detailed_hrv
  const hrv = payload.detailed_hrv;
  if (hrv && typeof hrv === "object") {
    addIsoPair(hrv.startTimestampGMT, hrv.startTimestampLocal);
    addIsoPair(hrv.endTimestampGMT, hrv.endTimestampLocal);
    addIsoPair(hrv.sleepStartTimestampGMT, hrv.sleepStartTimestampLocal);
    addIsoPair(hrv.sleepEndTimestampGMT, hrv.sleepEndTimestampLocal);
    if (Array.isArray(hrv.hrvReadings)) {
      for (const r of hrv.hrvReadings) {
        addIsoPair(r?.readingTimeGMT, r?.readingTimeLocal);
      }
    }
  }

  // 6. activities
  if (Array.isArray(payload.activities)) {
    for (const act of payload.activities) {
      addIsoPair(act?.startTimeGMT, act?.startTimeLocal);
    }
  }

  anchors.sort((a, b) => a.utcMs - b.utcMs);
  return anchors;
}

/**
 * Resolves the watch-recorded timezone offset (in milliseconds) at a given UTC timestamp.
 */
export function resolveOffsetMs(utcMs: number, anchors: TimeAnchor[]): number {
  if (!anchors.length) {
    return 0;
  }
  let bestOffset = anchors[0].offsetMs;
  let minDist = Math.abs(utcMs - anchors[0].utcMs);
  for (const a of anchors) {
    const dist = Math.abs(utcMs - a.utcMs);
    if (dist <= minDist) {
      minDist = dist;
      bestOffset = a.offsetMs;
    } else if (a.utcMs > utcMs) {
      break;
    }
  }
  return bestOffset;
}

/**
 * Converts a raw daily Garmin JSON payload into Firestore-ready summary and intraday documents.
 */
export function processRawDayPayload(payload: RawGarminDailyPayload): ProcessedDayResult {
  const calendarDate = payload.calendarDate;
  const anchors = buildWatchTimeAnchors(payload);

  // Primary timezone offset for this calendar date (in hours, e.g. +2 or +3)
  let primaryOffsetMs = anchors.length ? anchors[0].offsetMs : 0;
  const hrHeaderGmt = parseIsoAsUtcMs(payload.intraday_heart_rate?.startTimestampGMT);
  const hrHeaderLoc = parseIsoAsUtcMs(payload.intraday_heart_rate?.startTimestampLocal);
  if (hrHeaderGmt !== null && hrHeaderLoc !== null) {
    primaryOffsetMs = Math.round((hrHeaderLoc - hrHeaderGmt) / 60000) * 60000;
  }
  const timezoneOffsetHours = round1(primaryOffsetMs / 3600000);

  // 1. Parse Workouts & Exclusion Windows (Workout + 30m post-exercise cooldown)
  const rawActivities = Array.isArray(payload.activities) ? payload.activities : [];
  const workoutWindows: { startUtcMs: number; cooldownEndUtcMs: number }[] = [];
  const workouts: WorkoutSummary[] = [];

  for (const act of rawActivities) {
    if (!act || typeof act !== "object") continue;

    // Filter to activities starting on this watch-local calendarDate
    const startLocalRaw = typeof act.startTimeLocal === "string" ? act.startTimeLocal : "";
    if (startLocalRaw.length >= 10 && startLocalRaw.slice(0, 10) !== calendarDate) {
      continue;
    }

    const startGmtMs =
      typeof act.beginTimestamp === "number"
        ? act.beginTimestamp
        : parseIsoAsUtcMs(act.startTimeGMT);
    const startLocMs = parseIsoAsUtcMs(act.startTimeLocal);

    const offsetMs =
      startGmtMs !== null && startLocMs !== null
        ? Math.round((startLocMs - startGmtMs) / 60000) * 60000
        : startGmtMs !== null
        ? resolveOffsetMs(startGmtMs, anchors)
        : primaryOffsetMs;

    const resolvedStartUtcMs =
      startGmtMs !== null
        ? startGmtMs
        : startLocMs !== null
        ? startLocMs - offsetMs
        : null;

    if (resolvedStartUtcMs === null) continue;

    const durationSec =
      typeof act.elapsedDuration === "number" && act.elapsedDuration > 0
        ? act.elapsedDuration
        : typeof act.duration === "number"
        ? act.duration
        : 0;
    const durationMs = Math.round(durationSec * 1000);
    const endUtcMs = resolvedStartUtcMs + durationMs;
    const cooldownEndUtcMs = endUtcMs + 30 * 60 * 1000;

    workoutWindows.push({ startUtcMs: resolvedStartUtcMs, cooldownEndUtcMs });

    const startFmt = formatLocalEpochMs(resolvedStartUtcMs + offsetMs);
    const endFmt = formatLocalEpochMs(endUtcMs + offsetMs);
    const cooldownFmt = formatLocalEpochMs(cooldownEndUtcMs + offsetMs);

    const actType =
      typeof act.activityType === "string"
        ? act.activityType
        : act.activityType?.typeKey || "workout";

    workouts.push({
      activityId: Number(act.activityId || 0),
      activityName: String(act.activityName || actType),
      activityType: String(actType),
      startTimeLocal: startFmt.dateTimeSpace,
      endTimeLocal: endFmt.dateTimeSpace,
      startHourMinLocal: startFmt.timeHm,
      endHourMinLocal: endFmt.timeHm,
      cooldownEndHourMinLocal: cooldownFmt.timeHm,
      durationMin: round1(durationSec / 60),
      distanceMeters: typeof act.distance === "number" ? round1(act.distance) : null,
      averageHR: typeof act.averageHR === "number" ? Math.round(act.averageHR) : null,
      maxHR: typeof act.maxHR === "number" ? Math.round(act.maxHR) : null,
      calories: typeof act.calories === "number" ? Math.round(act.calories) : null,
      differenceBodyBattery:
        typeof act.differenceBodyBattery === "number" ? act.differenceBodyBattery : null,
      aerobicTrainingEffect:
        typeof act.aerobicTrainingEffect === "number"
          ? round1(act.aerobicTrainingEffect)
          : null,
      locationName: act.locationName ?? null,
    });
  }

  workouts.sort((a, b) => a.startTimeLocal.localeCompare(b.startTimeLocal));

  // 2. Process 2-minute Intraday Heart Rate Points in Watch-Local Time
  const hrObj = payload.intraday_heart_rate || {};
  const rawHrValues: any[] = Array.isArray(hrObj.heartRateValues)
    ? hrObj.heartRateValues
    : [];

  const hrPoints: IntradayDetailsDoc["hrPoints"] = [];
  const hourlyAllBuckets: number[][] = Array.from({ length: 24 }, () => []);
  const hourlySeatedBuckets: number[][] = Array.from({ length: 24 }, () => []);

  const asleepBaselineVals: number[] = []; // 04:00 - 07:00 local
  const daytimeRawVals: number[] = [];     // 09:00 - 17:00 local (all)
  const daytimeSeatedVals: number[] = [];  // 09:00 - 17:00 local (excluding workout + 30m cooldown)
  const eveningSeatedVals: number[] = [];  // 20:00 - 24:00 local (excluding workout + 30m cooldown)

  for (const pair of rawHrValues) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const utcMs = Number(pair[0]);
    const bpm = pair[1] !== null && pair[1] !== undefined ? Number(pair[1]) : null;
    if (!Number.isFinite(utcMs) || bpm === null || !Number.isFinite(bpm) || bpm <= 0) {
      continue;
    }

    const offsetMs = resolveOffsetMs(utcMs, anchors);
    const loc = formatLocalEpochMs(utcMs + offsetMs);

    // Keep strictly readings belonging to this watch-local calendarDate
    if (loc.dateStr !== calendarDate) {
      continue;
    }

    const inWorkoutOrCooldown = workoutWindows.some(
      (w) => utcMs >= w.startUtcMs && utcMs <= w.cooldownEndUtcMs
    );

    hrPoints.push({
      t: loc.timeHm,
      minuteOfDay: loc.minuteOfDay,
      utcMs,
      bpm,
      inWorkoutOrCooldown,
    });

    if (loc.hour >= 0 && loc.hour < 24) {
      hourlyAllBuckets[loc.hour].push(bpm);
      if (!inWorkoutOrCooldown) {
        hourlySeatedBuckets[loc.hour].push(bpm);
      }
    }

    // 04:00 - 07:00 watch-local (True Unmedicated Asleep Baseline)
    if (loc.minuteOfDay >= 4 * 60 && loc.minuteOfDay < 7 * 60 && !inWorkoutOrCooldown) {
      asleepBaselineVals.push(bpm);
    }

    // 09:00 - 17:00 watch-local (Daytime Active Window)
    if (loc.minuteOfDay >= 9 * 60 && loc.minuteOfDay < 17 * 60) {
      daytimeRawVals.push(bpm);
      if (!inWorkoutOrCooldown) {
        daytimeSeatedVals.push(bpm);
      }
    }

    // 20:00 - 24:00 watch-local (Evening Recovery Window)
    if (loc.minuteOfDay >= 20 * 60 && loc.minuteOfDay < 24 * 60 && !inWorkoutOrCooldown) {
      eveningSeatedVals.push(bpm);
    }
  }

  const hourlyHrLocal = hourlyAllBuckets.map((b) => avgOrNull(b));
  const hourlySeatedHrLocal = hourlySeatedBuckets.map((b) => avgOrNull(b));

  const asleepBaselineHr = avgOrNull(asleepBaselineVals);
  const daytimeRawHr = avgOrNull(daytimeRawVals);
  const daytimeSeatedHr = avgOrNull(daytimeSeatedVals);
  const eveningHr = avgOrNull(eveningSeatedVals);

  // 3. Process Overnight 5-Minute HRV Readings & Early/Late Night Washout Split
  const hrvObj = payload.detailed_hrv || {};
  const hrvSummary = hrvObj.hrvSummary || {};
  const rawHrvReadings: any[] = Array.isArray(hrvObj.hrvReadings)
    ? hrvObj.hrvReadings
    : [];

  const parsedHrvTemp: {
    t: string;
    localIso: string;
    utcMs: number;
    hrv: number;
  }[] = [];

  for (const r of rawHrvReadings) {
    if (!r || typeof r.hrvValue !== "number" || r.hrvValue <= 0) continue;
    const gmtMs = parseIsoAsUtcMs(r.readingTimeGMT);
    const locMs = parseIsoAsUtcMs(r.readingTimeLocal);
    if (gmtMs === null && locMs === null) continue;

    const utcMs = gmtMs !== null ? gmtMs : locMs! - primaryOffsetMs;
    const localEpochMs =
      locMs !== null ? locMs : utcMs + resolveOffsetMs(utcMs, anchors);
    const loc = formatLocalEpochMs(localEpochMs);

    parsedHrvTemp.push({
      t: loc.timeHm,
      localIso: loc.isoLocal,
      utcMs,
      hrv: r.hrvValue,
    });
  }

  parsedHrvTemp.sort((a, b) => a.utcMs - b.utcMs);
  const midIdx = Math.floor(parsedHrvTemp.length / 2);

  const hrvPoints: IntradayDetailsDoc["hrvPoints"] = parsedHrvTemp.map((pt, idx) => ({
    ...pt,
    half: idx < midIdx ? 1 : 2,
  }));

  let earlyNightHrvAvg: number | null = null;
  let lateNightHrvAvg: number | null = null;
  if (hrvPoints.length >= 4) {
    const firstHalf = hrvPoints.slice(0, midIdx).map((p) => p.hrv);
    const secondHalf = hrvPoints.slice(midIdx).map((p) => p.hrv);
    earlyNightHrvAvg = avgOrNull(firstHalf);
    lateNightHrvAvg = avgOrNull(secondHalf);
  }

  const rawBaseline = hrvSummary.baseline;
  const hrvBaseline: HrvBaseline | null =
    rawBaseline && typeof rawBaseline === "object"
      ? {
          lowUpper: typeof rawBaseline.lowUpper === "number" ? rawBaseline.lowUpper : null,
          balancedLow:
            typeof rawBaseline.balancedLow === "number" ? rawBaseline.balancedLow : null,
          balancedUpper:
            typeof rawBaseline.balancedUpper === "number" ? rawBaseline.balancedUpper : null,
          markerValue:
            typeof rawBaseline.markerValue === "number" ? rawBaseline.markerValue : null,
        }
      : null;

  // 4. Process Sleep Architecture (Watch-Local Time)
  const slp = payload.detailed_sleep || {};
  let sleepStartLocal: string | null = null;
  let sleepEndLocal: string | null = null;

  if (typeof slp.sleepStartTimestampLocal === "number") {
    sleepStartLocal = formatLocalEpochMs(slp.sleepStartTimestampLocal).timeHm;
  } else if (typeof hrvObj.sleepStartTimestampLocal === "string") {
    const ms = parseIsoAsUtcMs(hrvObj.sleepStartTimestampLocal);
    if (ms !== null) sleepStartLocal = formatLocalEpochMs(ms).timeHm;
  }

  if (typeof slp.sleepEndTimestampLocal === "number") {
    sleepEndLocal = formatLocalEpochMs(slp.sleepEndTimestampLocal).timeHm;
  } else if (typeof hrvObj.sleepEndTimestampLocal === "string") {
    const ms = parseIsoAsUtcMs(hrvObj.sleepEndTimestampLocal);
    if (ms !== null) sleepEndLocal = formatLocalEpochMs(ms).timeHm;
  }

  const sleepStressAvg =
    typeof slp.avgSleepStress === "number" ? round1(slp.avgSleepStress) : null;
  const sleepScore =
    typeof slp.sleepScores?.overall?.value === "number"
      ? slp.sleepScores.overall.value
      : null;

  // 5. Process Body Battery Intraday Points
  const bbObj = Array.isArray(payload.body_battery)
    ? payload.body_battery[0] || {}
    : payload.body_battery || {};
  const rawBbArray: any[] = Array.isArray(bbObj.bodyBatteryValuesArray)
    ? bbObj.bodyBatteryValuesArray
    : [];

  const bodyBatteryPoints: IntradayDetailsDoc["bodyBatteryPoints"] = [];
  for (const item of rawBbArray) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const utcMs = Number(item[0]);
    const level = item[1] !== null && item[1] !== undefined ? Number(item[1]) : null;
    if (!Number.isFinite(utcMs) || level === null || !Number.isFinite(level)) continue;

    const offsetMs = resolveOffsetMs(utcMs, anchors);
    const loc = formatLocalEpochMs(utcMs + offsetMs);
    if (loc.dateStr !== calendarDate) continue;

    bodyBatteryPoints.push({
      t: loc.timeHm,
      minuteOfDay: loc.minuteOfDay,
      utcMs,
      level,
    });
  }
  bodyBatteryPoints.sort((a, b) => a.utcMs - b.utcMs);

  // 6. User Summary & All-Day Metrics
  const u = payload.user_summary || {};
  const spo2Obj = payload.spo2 || {};

  const restingHr =
    typeof u.restingHeartRate === "number"
      ? u.restingHeartRate
      : typeof hrObj.restingHeartRate === "number"
      ? hrObj.restingHeartRate
      : null;

  const minHr =
    typeof u.minHeartRate === "number"
      ? u.minHeartRate
      : typeof hrObj.minHeartRate === "number"
      ? hrObj.minHeartRate
      : null;

  const maxHr =
    typeof u.maxHeartRate === "number"
      ? u.maxHeartRate
      : typeof hrObj.maxHeartRate === "number"
      ? hrObj.maxHeartRate
      : null;

  const abnormalHrAlertsCount =
    typeof u.abnormalHeartRateAlertsCount === "number"
      ? u.abnormalHeartRateAlertsCount
      : 0;

  const stressAvg =
    typeof u.averageStressLevel === "number" && u.averageStressLevel >= 0
      ? u.averageStressLevel
      : null;
  const stressMax =
    typeof u.maxStressLevel === "number" && u.maxStressLevel >= 0
      ? u.maxStressLevel
      : null;

  // 7. Automated Clinical Insight Flags
  const deltaSeatedHrBpm =
    daytimeSeatedHr !== null && asleepBaselineHr !== null
      ? round1(daytimeSeatedHr - asleepBaselineHr)
      : null;

  const deltaHrExceeds20 = deltaSeatedHrBpm !== null && deltaSeatedHrBpm >= 20;

  const overnightHrvSuppressionPct =
    earlyNightHrvAvg !== null && lateNightHrvAvg !== null && lateNightHrvAvg > 0
      ? round1((1 - earlyNightHrvAvg / lateNightHrvAvg) * 100)
      : null;

  const lateDoseCarryoverWarning =
    (overnightHrvSuppressionPct !== null && overnightHrvSuppressionPct > 25) ||
    (sleepStressAvg !== null && sleepStressAvg >= 25);

  const summary: DaySummaryDoc = {
    calendarDate,
    updatedAtUTC: new Date().toISOString(),
    timezoneOffsetHours,
    hourlyHrLocal,
    hourlySeatedHrLocal,
    restingHr,
    asleepBaselineHr,
    daytimeRawHr,
    daytimeSeatedHr,
    eveningHr,
    minHr,
    maxHr,
    abnormalHrAlertsCount,
    hrvNightAvg:
      typeof hrvSummary.lastNightAvg === "number" ? hrvSummary.lastNightAvg : null,
    hrvWeeklyAvg:
      typeof hrvSummary.weeklyAvg === "number" ? hrvSummary.weeklyAvg : null,
    hrv5MinHigh:
      typeof hrvSummary.lastNight5MinHigh === "number"
        ? hrvSummary.lastNight5MinHigh
        : null,
    hrvStatus: typeof hrvSummary.status === "string" ? hrvSummary.status : null,
    hrvBaseline,
    earlyNightHrvAvg,
    lateNightHrvAvg,
    sleepStartLocal,
    sleepEndLocal,
    sleepDurationSec:
      typeof slp.sleepTimeSeconds === "number" ? slp.sleepTimeSeconds : null,
    deepSleepSec:
      typeof slp.deepSleepSeconds === "number" ? slp.deepSleepSeconds : null,
    lightSleepSec:
      typeof slp.lightSleepSeconds === "number" ? slp.lightSleepSeconds : null,
    remSleepSec: typeof slp.remSleepSeconds === "number" ? slp.remSleepSeconds : null,
    awakeSleepSec:
      typeof slp.awakeSleepSeconds === "number" ? slp.awakeSleepSeconds : null,
    sleepStressAvg,
    sleepScore,
    sleepAvgHr: typeof slp.avgHeartRate === "number" ? round1(slp.avgHeartRate) : null,
    sleepRespirationAvg:
      typeof slp.averageRespirationValue === "number"
        ? round1(slp.averageRespirationValue)
        : null,
    sleepSpo2Avg:
      typeof slp.averageSpO2Value === "number" ? round1(slp.averageSpO2Value) : null,
    stressAvg,
    stressMax,
    restStressPct:
      typeof u.restStressPercentage === "number" ? round1(u.restStressPercentage) : null,
    lowStressPct:
      typeof u.lowStressPercentage === "number" ? round1(u.lowStressPercentage) : null,
    mediumStressPct:
      typeof u.mediumStressPercentage === "number"
        ? round1(u.mediumStressPercentage)
        : null,
    highStressPct:
      typeof u.highStressPercentage === "number" ? round1(u.highStressPercentage) : null,
    bodyBatteryCharged:
      typeof u.bodyBatteryChargedValue === "number"
        ? u.bodyBatteryChargedValue
        : typeof bbObj.charged === "number"
        ? bbObj.charged
        : null,
    bodyBatteryDrained:
      typeof u.bodyBatteryDrainedValue === "number"
        ? u.bodyBatteryDrainedValue
        : typeof bbObj.drained === "number"
        ? bbObj.drained
        : null,
    bodyBatteryHigh:
      typeof u.bodyBatteryHighestValue === "number" ? u.bodyBatteryHighestValue : null,
    bodyBatteryLow:
      typeof u.bodyBatteryLowestValue === "number" ? u.bodyBatteryLowestValue : null,
    steps: typeof u.totalSteps === "number" ? u.totalSteps : null,
    activeCalories:
      typeof u.activeKilocalories === "number"
        ? Math.round(u.activeKilocalories)
        : null,
    wakingRespirationAvg:
      typeof u.avgWakingRespirationValue === "number"
        ? round1(u.avgWakingRespirationValue)
        : null,
    spo2Avg:
      typeof u.averageSpo2 === "number"
        ? round1(u.averageSpo2)
        : typeof spo2Obj.averageSpO2 === "number"
        ? round1(spo2Obj.averageSpO2)
        : null,
    workouts,
    flags: {
      deltaHrExceeds20,
      deltaSeatedHrBpm,
      lateDoseCarryoverWarning,
      overnightHrvSuppressionPct,
      hasAbnormalHrAlert: abnormalHrAlertsCount > 0,
    },
  };

  const intraday: IntradayDetailsDoc = {
    calendarDate,
    hrPoints,
    hrvPoints,
    bodyBatteryPoints,
  };

  return { summary, intraday };
}

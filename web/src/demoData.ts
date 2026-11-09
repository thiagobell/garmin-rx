import type {
  AccessConfigDoc,
  DayLogDoc,
  DaySummaryDoc,
  IntradayDetailsDoc,
  PrivateNoteDoc,
  RegimenEraDoc,
} from './types';
import {
  DEFAULT_CURRENT_TREATMENT_COLOR,
  DEFAULT_PRE_TREATMENT_COLOR,
} from './utils/regimenColors';

export const DEFAULT_ACCESS_CONFIG: AccessConfigDoc = {
  ownerEmail: 'owner@gmail.com',
  allowedViewerEmails: ['dr.cardiology@clinic.org', 'psychiatry.consult@clinic.org'],
  pkSettings: {
    irOnsetMinutes: 45,
    irPeakEndMinutes: 150,
    irDurationMinutes: 240,
  },
  medicationSettings: {
    defaultMedicationName: 'Medication',
    customDosePresets: [5, 10, 15, 20],
  },
  lastGarminSyncUTC: '2026-10-21T20:00:12Z',
  lastGarminSyncStatus: 'OK (Synced 2026-10-20 & 2026-10-21)',
};

// Colors come from the validated regimen palette (see utils/regimenColors.ts).
export const DEFAULT_REGIMEN_ERAS: RegimenEraDoc[] = [
  {
    id: 'era-pre-treatment',
    title: 'Pre-Treatment',
    startDate: '2026-08-01',
    endDate: '2026-09-21',
    isMedicated: false,
    color: DEFAULT_PRE_TREATMENT_COLOR,
    notes: 'Baseline period before starting treatment.',
  },
  {
    id: 'era-since-starting-treatment',
    title: 'Since Starting Treatment',
    startDate: '2026-09-22',
    endDate: '2099-12-31',
    isMedicated: true,
    color: DEFAULT_CURRENT_TREATMENT_COLOR,
    notes: 'Treatment period (not taken every day; dose varies).',
  },
];

// Deterministic pseudo-random helper for realistic clinical fallback data
function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function generateDemoDataset(): {
  days: DaySummaryDoc[];
  dayLogs: Record<string, DayLogDoc>;
  privateNotes: Record<string, PrivateNoteDoc>;
} {
  const days: DaySummaryDoc[] = [];
  const dayLogs: Record<string, DayLogDoc> = {};
  const privateNotes: Record<string, PrivateNoteDoc> = {};

  const start = new Date('2026-08-01T00:00:00Z');
  const totalDays = 82; // Aug 1 to Oct 21, 2026

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const calendarDate = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getUTCDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const inEra1 = calendarDate <= '2026-08-31';
    const inEra2 = calendarDate >= '2026-09-01' && calendarDate <= '2026-09-28';
    const isMedicatedDay = !inEra1 && !(isWeekend && seededNoise(i + 500) > 0.35);

    // Late dose experiment days in Era 2 (e.g., 16:30 or 17:15 second/third dose)
    const hasLateDose = inEra2 && !isWeekend && i % 4 === 1;
    const hasWorkout = i % 3 === 0 || i === totalDays - 2;
    const hasAlert = isMedicatedDay && !hasWorkout && i % 19 === 0;

    const asleepBaselineHr = Math.round(54 + seededNoise(i * 3 + 1) * 5);
    const restingHr = asleepBaselineHr + 2;

    const medDelta = isMedicatedDay ? Math.round(13 + seededNoise(i * 7) * 9) : Math.round(6 + seededNoise(i * 5) * 4);
    const daytimeSeatedHr = asleepBaselineHr + medDelta;
    const daytimeRawHr = hasWorkout ? daytimeSeatedHr + 11 : daytimeSeatedHr;
    const eveningHr = asleepBaselineHr + (hasLateDose ? 16 : 7);

    const lateNightHrvAvg = Math.round(42 + seededNoise(i * 11) * 10);
    const earlyNightHrvAvg = hasLateDose
      ? Math.round(lateNightHrvAvg * (0.66 + seededNoise(i * 13) * 0.06))
      : Math.round(lateNightHrvAvg * (0.88 + seededNoise(i * 13) * 0.14));
    const hrvNightAvg = Math.round((earlyNightHrvAvg + lateNightHrvAvg) / 2);
    const sleepStressAvg = hasLateDose
      ? Math.round(26 + seededNoise(i * 17) * 7)
      : Math.round(13 + seededNoise(i * 17) * 8);

    const hourlySeatedHrLocal: (number | null)[] = [];
    const hourlyHrLocal: (number | null)[] = [];

    for (let h = 0; h < 24; h++) {
      let base = asleepBaselineHr;
      if (h >= 0 && h < 4) base = asleepBaselineHr + 3 + (hasLateDose ? 6 : 0);
      else if (h >= 4 && h <= 7) base = asleepBaselineHr;
      else if (h === 8) base = asleepBaselineHr + 8;
      else if (h >= 9 && h <= 17) {
        const pkBoost = isMedicatedDay
          ? h >= 9 && h <= 12
            ? medDelta + 3
            : h >= 13 && h <= 16
            ? medDelta + 2
            : medDelta - 2
          : 6;
        base = asleepBaselineHr + pkBoost;
      } else if (h >= 18 && h <= 21) {
        base = asleepBaselineHr + (hasLateDose ? 17 : 9);
      } else {
        base = asleepBaselineHr + (hasLateDose ? 11 : 4);
      }

      const jitter = Math.round((seededNoise(i * 31 + h) - 0.5) * 4);
      const seatedVal = Math.max(48, base + jitter);
      hourlySeatedHrLocal.push(seatedVal);

      if (hasWorkout && h === 12) {
        hourlyHrLocal.push(152 + Math.round(seededNoise(i + h) * 16));
      } else {
        hourlyHrLocal.push(seatedVal);
      }
    }

    const workouts = hasWorkout
      ? [
          {
            activityId: 100000 + i,
            activityName: i % 2 === 0 ? 'Threshold Tempo Run' : 'Zone 2 Aerobic Run',
            activityType: 'running',
            startTimeLocal: `${calendarDate} 12:05:00`,
            endTimeLocal: `${calendarDate} 12:50:00`,
            startHourMinLocal: '12:05',
            endHourMinLocal: '12:50',
            cooldownEndHourMinLocal: '13:20',
            durationMin: 45,
            distanceMeters: 8450,
            averageHR: 158,
            maxHR: 179,
            calories: 590,
            differenceBodyBattery: -18,
            aerobicTrainingEffect: 3.4,
            locationName: calendarDate < '2026-09-15' ? 'Nicosia' : 'Zurich',
          },
        ]
      : [];

    const suppressionPct =
      lateNightHrvAvg > 0
        ? Math.round((1 - earlyNightHrvAvg / lateNightHrvAvg) * 1000) / 10
        : null;

    const deltaSeatedHrBpm = daytimeSeatedHr - asleepBaselineHr;
    const lateDoseCarryoverWarning =
      (suppressionPct !== null && suppressionPct > 25) || sleepStressAvg >= 25;

    days.push({
      calendarDate,
      updatedAtUTC: `${calendarDate}T22:00:00Z`,
      timezoneOffsetHours: calendarDate < '2026-09-15' ? 3 : 2,
      hourlyHrLocal,
      hourlySeatedHrLocal,
      restingHr,
      asleepBaselineHr,
      daytimeRawHr,
      daytimeSeatedHr,
      eveningHr,
      minHr: asleepBaselineHr - 4,
      maxHr: hasWorkout ? 179 : daytimeSeatedHr + (hasAlert ? 26 : 14),
      abnormalHrAlertsCount: hasAlert ? 1 : 0,
      hrvNightAvg,
      hrvWeeklyAvg: Math.round(41 + seededNoise(i * 2) * 5),
      hrv5MinHigh: lateNightHrvAvg + 14,
      hrvStatus: lateDoseCarryoverWarning ? 'UNBALANCED' : 'BALANCED',
      hrvBaseline: {
        lowUpper: 33,
        balancedLow: 36,
        balancedUpper: 48,
        markerValue: hrvNightAvg,
      },
      earlyNightHrvAvg,
      lateNightHrvAvg,
      sleepStartLocal: '23:15',
      sleepEndLocal: '07:10',
      sleepDurationSec: Math.round((7.4 + seededNoise(i * 9) * 0.9) * 3600),
      deepSleepSec: Math.round((1.35 + (hasLateDose ? -0.35 : 0.15)) * 3600),
      lightSleepSec: Math.round(4.3 * 3600),
      remSleepSec: Math.round((1.65 + (hasLateDose ? -0.25 : 0.1)) * 3600),
      awakeSleepSec: Math.round((hasLateDose ? 0.45 : 0.2) * 3600),
      sleepStressAvg,
      sleepScore: hasLateDose ? 68 : 84,
      sleepAvgHr: asleepBaselineHr + (hasLateDose ? 5 : 1),
      sleepRespirationAvg: 14.2,
      sleepSpo2Avg: 96,
      stressAvg: isMedicatedDay ? 34 : 26,
      stressMax: 82,
      restStressPct: isMedicatedDay ? 38 : 49,
      lowStressPct: 32,
      mediumStressPct: 20,
      highStressPct: 10,
      bodyBatteryCharged: hasLateDose ? 54 : 76,
      bodyBatteryDrained: hasWorkout ? 82 : 68,
      bodyBatteryHigh: hasLateDose ? 69 : 91,
      bodyBatteryLow: 18,
      steps: hasWorkout ? 12840 : 6420,
      activeCalories: hasWorkout ? 840 : 360,
      wakingRespirationAvg: 15.1,
      spo2Avg: 96.4,
      workouts,
      flags: {
        deltaHrExceeds20: deltaSeatedHrBpm >= 20,
        deltaSeatedHrBpm,
        lateDoseCarryoverWarning,
        overnightHrvSuppressionPct: suppressionPct,
        hasAbnormalHrAlert: hasAlert,
      },
    });

    const events: DayLogDoc['events'] = [];
    if (isMedicatedDay) {
      events.push({
        id: `dose-1-${calendarDate}`,
        timeLocal: '08:45',
        minuteOfDay: 8 * 60 + 45,
        type: 'DOSE',
        medication: 'Medication IR',
        doseMg: 10,
        releaseType: 'IR',
        note: 'Morning dose after breakfast',
        createdAtUTC: `${calendarDate}T08:45:00Z`,
      });
      events.push({
        id: `caff-1-${calendarDate}`,
        timeLocal: '09:30',
        minuteOfDay: 9 * 60 + 30,
        type: 'CAFFEINE',
        caffeineLabel: 'Espresso (80mg)',
        caffeineMg: 80,
        createdAtUTC: `${calendarDate}T09:30:00Z`,
      });
      const secondDoseTime = hasLateDose ? '16:45' : '13:15';
      const [sh, sm] = secondDoseTime.split(':').map(Number);
      events.push({
        id: `dose-2-${calendarDate}`,
        timeLocal: secondDoseTime,
        minuteOfDay: sh * 60 + sm,
        type: 'DOSE',
        medication: 'Medication IR',
        doseMg: 10,
        releaseType: 'IR',
        note: hasLateDose ? 'Late afternoon booster (delayed meeting)' : 'Early afternoon dose before 14:30 cutoff',
        createdAtUTC: `${calendarDate}T${secondDoseTime}:00Z`,
      });

      if (hasAlert || hasLateDose) {
        events.push({
          id: `se-1-${calendarDate}`,
          timeLocal: hasLateDose ? '18:10' : '10:35',
          minuteOfDay: hasLateDose ? 18 * 60 + 10 : 10 * 60 + 35,
          type: 'SIDE_EFFECT',
          sideEffects: hasLateDose ? ['crash', 'jittery'] : ['palpitations', 'peak_focus'],
          severity: hasLateDose ? 3 : 2,
          note: hasLateDose
            ? 'Evening rebound + elevated resting pulse'
            : 'Noticeable heart rate elevation when combining espresso + peak IR',
          createdAtUTC: `${calendarDate}T18:10:00Z`,
        });
      }
    }

    dayLogs[calendarDate] = {
      calendarDate,
      events,
      eodSummary: {
        focus: isMedicatedDay ? 4 : 2,
        mood: hasLateDose ? 3 : 4,
        appetite: isMedicatedDay ? 3 : 5,
      },
      contextTags: [
        isWeekend ? 'Weekend / Off-meds' : 'Workday',
        ...(hasWorkout ? ['Exercise'] : []),
        ...(hasLateDose ? ['Poor sleep'] : []),
      ],
      updatedAtUTC: `${calendarDate}T21:30:00Z`,
    };

    if (i === totalDays - 1) {
      privateNotes[calendarDate] = {
        calendarDate,
        note: 'Personal reminder: keep espresso at least 60m after morning 10mg IR to avoid transient 98 bpm spike.',
        updatedAtUTC: `${calendarDate}T21:35:00Z`,
      };
    }
  }

  return { days, dayLogs, privateNotes };
}

export function generateDemoIntraday(day: DaySummaryDoc): IntradayDetailsDoc {
  const hrPoints: IntradayDetailsDoc['hrPoints'] = [];
  const bodyBatteryPoints: IntradayDetailsDoc['bodyBatteryPoints'] = [];
  const hrvPoints: IntradayDetailsDoc['hrvPoints'] = [];

  const workout = day.workouts[0];
  const workoutStartMin = workout ? 12 * 60 + 5 : -1;
  const workoutCooldownEndMin = workout ? 13 * 60 + 20 : -1;

  for (let m = 0; m < 1440; m += 2) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const t = `${hh}:${mm}`;
    const hourIdx = Math.floor(m / 60);
    const hourAvg = day.hourlyHrLocal[hourIdx] ?? day.asleepBaselineHr ?? 60;

    const inWorkoutOrCooldown =
      workoutStartMin >= 0 && m >= workoutStartMin && m <= workoutCooldownEndMin;

    let bpm = hourAvg + Math.round(Math.sin(m / 11) * 3.5 + Math.cos(m / 5) * 2);
    if (inWorkoutOrCooldown) {
      if (m <= workoutStartMin + 45) {
        bpm = 148 + Math.round(Math.sin((m - workoutStartMin) / 6) * 22);
      } else {
        // 30-min post-exercise cooldown decay
        const intoCooldown = m - (workoutStartMin + 45);
        bpm = Math.round(122 - intoCooldown * 1.15);
      }
    }

    hrPoints.push({
      t,
      minuteOfDay: m,
      utcMs: Date.parse(`${day.calendarDate}T${t}:00Z`),
      bpm,
      inWorkoutOrCooldown,
    });

    if (m % 16 === 0) {
      let level = 75;
      if (m < 430) {
        level = Math.min(95, Math.round(28 + (m / 430) * (day.bodyBatteryCharged ?? 65)));
      } else {
        const drainProgress = (m - 430) / (1440 - 430);
        level = Math.max(14, Math.round((day.bodyBatteryHigh ?? 88) - drainProgress * (day.bodyBatteryDrained ?? 68)));
      }
      bodyBatteryPoints.push({
        t,
        minuteOfDay: m,
        utcMs: Date.parse(`${day.calendarDate}T${t}:00Z`),
        level,
      });
    }
  }

  // Generate 5-minute overnight HRV readings (from 23:15 prev night to 07:10 wake)
  const totalReadings = 94;
  const earlyTarget = day.earlyNightHrvAvg ?? 34;
  const lateTarget = day.lateNightHrvAvg ?? 45;

  for (let idx = 0; idx < totalReadings; idx++) {
    const offsetMin = (23 * 60 + 15 + idx * 5) % 1440;
    const hh = String(Math.floor(offsetMin / 60)).padStart(2, '0');
    const mm = String(offsetMin % 60).padStart(2, '0');
    const t = `${hh}:${mm}`;
    const half: 1 | 2 = idx < totalReadings / 2 ? 1 : 2;
    const target = half === 1 ? earlyTarget : lateTarget;
    const wave = Math.round(Math.sin(idx / 3.2) * 5 + Math.cos(idx / 1.9) * 3);
    const hrv = Math.max(16, target + wave);

    hrvPoints.push({
      t,
      localIso: `${day.calendarDate}T${t}:00`,
      utcMs: Date.parse(`${day.calendarDate}T00:00:00Z`) + idx * 300000,
      hrv,
      half,
    });
  }

  return {
    calendarDate: day.calendarDate,
    hrPoints,
    hrvPoints,
    bodyBatteryPoints,
  };
}

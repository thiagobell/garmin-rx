/**
 * Shared Firestore Document Interfaces for Health Dashboard.
 * Used identically by `functions/` (TypeScript Cloud Functions + Seeder) and `web/` (React PWA).
 */

export interface WorkoutSummary {
  activityId: number;
  activityName: string;
  activityType: string; // e.g., "running", "cycling"
  startTimeLocal: string; // "YYYY-MM-DD HH:MM:SS"
  endTimeLocal: string;   // "YYYY-MM-DD HH:MM:SS"
  startHourMinLocal: string; // "HH:MM"
  endHourMinLocal: string;   // "HH:MM"
  cooldownEndHourMinLocal: string; // "HH:MM" (+30m post-workout exclusion window)
  durationMin: number;
  distanceMeters: number | null;
  averageHR: number | null;
  maxHR: number | null;
  calories: number | null;
  differenceBodyBattery: number | null;
  aerobicTrainingEffect: number | null;
  locationName?: string | null;
}

export interface HrvBaseline {
  lowUpper: number | null;
  balancedLow: number | null;
  balancedUpper: number | null;
  markerValue: number | null;
}

/**
 * Firestore Document: `days/{YYYY-MM-DD}`
 * Lightweight summary loaded across 80-120 days in a single collection query
 * for longitudinal safety charts, Regimen Era comparisons, and the 24h Carpet Heatmap.
 */
export interface DaySummaryDoc {
  calendarDate: string; // "YYYY-MM-DD"
  updatedAtUTC: string;
  timezoneOffsetHours: number; // Watch-recorded offset (e.g. +2 or +3)

  // 24-element array of average BPM for each watch-local hour [00..23] (null if no readings)
  hourlyHrLocal: (number | null)[];
  // 24-element array of average BPM excluding workout + 30m cooldown windows
  hourlySeatedHrLocal: (number | null)[];

  // Key Heart Rate Metrics (BPM)
  restingHr: number | null;          // Garmin reported RHR
  asleepBaselineHr: number | null;   // 04:00-07:00 watch-local average
  daytimeRawHr: number | null;       // 09:00-17:00 watch-local average (all points)
  daytimeSeatedHr: number | null;    // 09:00-17:00 watch-local average (excluding workouts + 30m cooldown)
  eveningHr: number | null;          // 20:00-24:00 watch-local average (excluding workouts + 30m cooldown)
  minHr: number | null;
  maxHr: number | null;
  abnormalHrAlertsCount: number;

  // Overnight HRV Metrics (indexed by wake-up date)
  hrvNightAvg: number | null;
  hrvWeeklyAvg: number | null;
  hrv5MinHigh: number | null;
  hrvStatus: string | null;          // "BALANCED" | "UNBALANCED" | "LOW" | etc.
  hrvBaseline: HrvBaseline | null;
  earlyNightHrvAvg: number | null;   // 1st half of sleep 5-min HRV avg (ms)
  lateNightHrvAvg: number | null;    // 2nd half of sleep 5-min HRV avg (ms)

  // Sleep Architecture (Watch-Local Time)
  sleepStartLocal: string | null;    // "HH:MM"
  sleepEndLocal: string | null;      // "HH:MM"
  sleepDurationSec: number | null;
  deepSleepSec: number | null;
  lightSleepSec: number | null;
  remSleepSec: number | null;
  awakeSleepSec: number | null;
  sleepStressAvg: number | null;
  sleepScore: number | null;
  sleepAvgHr: number | null;
  sleepRespirationAvg: number | null;
  sleepSpo2Avg: number | null;

  // All-Day Stress & Body Battery & Activity
  stressAvg: number | null;
  stressMax: number | null;
  restStressPct: number | null;
  lowStressPct: number | null;
  mediumStressPct: number | null;
  highStressPct: number | null;
  bodyBatteryCharged: number | null;
  bodyBatteryDrained: number | null;
  bodyBatteryHigh: number | null;
  bodyBatteryLow: number | null;
  steps: number | null;
  activeCalories: number | null;
  wakingRespirationAvg: number | null;
  spo2Avg: number | null;

  // Recorded Workouts on this local calendar date
  workouts: WorkoutSummary[];

  // Automated Clinical Insight Flags
  flags: {
    deltaHrExceeds20: boolean;          // daytimeSeatedHr - asleepBaselineHr >= 20 bpm
    deltaSeatedHrBpm: number | null;    // daytimeSeatedHr - asleepBaselineHr
    lateDoseCarryoverWarning: boolean;  // earlyNightHrvAvg suppressed >25% below lateNightHrvAvg or sleepStress >= 25
    overnightHrvSuppressionPct: number | null; // (1 - earlyNightHrvAvg / lateNightHrvAvg) * 100
    hasAbnormalHrAlert: boolean;        // abnormalHrAlertsCount > 0
  };
}

/**
 * Firestore Document: `days/{YYYY-MM-DD}/intraday/details`
 * Loaded on demand when inspecting a single day in DayExplorer.
 */
export interface IntradayDetailsDoc {
  calendarDate: string;
  // 2-minute resolution HR points in watch-local time (00:00 -> 24:00)
  hrPoints: {
    t: string;            // "HH:MM" watch-local
    minuteOfDay: number;  // 0..1439
    utcMs: number;
    bpm: number;
    inWorkoutOrCooldown: boolean;
  }[];
  // 5-minute resolution overnight HRV points (from bedtime to wake time)
  hrvPoints: {
    t: string;            // "HH:MM" watch-local
    localIso: string;     // "YYYY-MM-DDTHH:MM:SS"
    utcMs: number;
    hrv: number;          // ms
    half: 1 | 2;          // 1st half vs 2nd half of sleep
  }[];
  // Body Battery inflection points in watch-local time
  bodyBatteryPoints: {
    t: string;            // "HH:MM" watch-local
    minuteOfDay: number;
    utcMs: number;
    level: number;
  }[];
}

export type MedEventType = "DOSE" | "CAFFEINE" | "SIDE_EFFECT";

export type SideEffectTag =
  | "crash"
  | "palpitations"
  | "jittery"
  | "headache"
  | "anxiety"
  | "dry_mouth"
  | "appetite_loss"
  | "insomnia"
  | "peak_focus";

export interface LoggedEvent {
  id: string;
  timeLocal: string;      // "HH:MM" (24h local time)
  minuteOfDay: number;    // 0..1439
  type: MedEventType;
  // For DOSE
  medication?: string;    // Configured medication name
  doseMg?: number;        // e.g. 5, 10, 15, 20
  releaseType?: "IR" | "LA";
  // For CAFFEINE
  caffeineLabel?: string; // e.g. "Espresso (80mg)", "Coffee (120mg)"
  caffeineMg?: number;
  // For SIDE_EFFECT
  sideEffects?: SideEffectTag[];
  severity?: 1 | 2 | 3 | 4 | 5;
  // Public note (visible to doctor)
  note?: string;
  createdAtUTC: string;
}

/**
 * Firestore Document: `day_logs/{YYYY-MM-DD}`
 * Doctor-visible medication doses, caffeine, side-effect pins, end-of-day ratings, and context tags.
 */
export interface DayLogDoc {
  calendarDate: string;
  events: LoggedEvent[];
  eodSummary?: {
    focus: number | null;     // 1-5
    mood: number | null;      // 1-5
    appetite: number | null;  // 1-5
  };
  contextTags: string[];      // e.g., ["Workday", "Weekend / Off-meds", "Poor sleep", "Travel / Alcohol", "Exercise"]
  updatedAtUTC: string;
}

/**
 * Firestore Document: `private_notes/{YYYY-MM-DD}`
 * Strictly Owner-Only (blocked from Doctor's Gmail by Firestore Security Rules).
 */
export interface PrivateNoteDoc {
  calendarDate: string;
  note: string;
  updatedAtUTC: string;
}

/**
 * Firestore Document: `regimen_eras/{id}`
 * Defines historical or current medication eras so 80+ day charts & tables group automatically.
 */
export interface RegimenEraDoc {
  id: string;
  title: string;              // e.g., "Pre-Treatment", "Treatment"
  startDate: string;          // "YYYY-MM-DD"
  endDate: string;            // "YYYY-MM-DD" (or "2099-12-31" for ongoing)
  isMedicated: boolean;
  defaultDoseMg?: number;
  dosesPerDay?: number;
  color: string;              // Hex color for badges/dividers
  notes?: string;
}

/**
 * Firestore Document: `config/access`
 * Controls Owner + Doctor Gmail allowlist and pharmacokinetic display settings.
 */
export interface MedicationSettings {
  defaultMedicationName?: string; // Configured medication name
  customDosePresets?: number[];   // e.g. [5, 10, 15, 20]
}

export interface AccessConfigDoc {
  ownerEmail: string;
  allowedViewerEmails: string[]; // Doctor / Guest Gmail(s)
  pkSettings: {
    irOnsetMinutes: number;      // Default 45
    irPeakEndMinutes: number;    // Default 150 (2.5h)
    irDurationMinutes: number;   // Default 240 (4.0h)
  };
  medicationSettings?: MedicationSettings;
  lastGarminSyncUTC?: string;
  lastGarminSyncStatus?: string;
}

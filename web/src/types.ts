/**
 * Re-export all shared interfaces from `../../shared/types.ts`
 * plus frontend-specific helper types.
 */
export type {
  WorkoutSummary,
  HrvBaseline,
  DaySummaryDoc,
  IntradayDetailsDoc,
  MedEventType,
  SideEffectTag,
  LoggedEvent,
  DayLogDoc,
  PrivateNoteDoc,
  RegimenEraDoc,
  AccessConfigDoc,
  MedicationSettings,
} from '../../shared/types';

export type UserRole = 'owner' | 'guest' | 'unauthorized' | 'demo';

export type DashboardTab =
  | 'day-explorer'
  | 'carpet-heatmap'
  | 'longitudinal-safety'
  | 'regimen-comparison';

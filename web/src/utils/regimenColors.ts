// ─────────────────────────────────────────────────────────────────────────────
// Regimen ("Period") color system
//
// Regimen colors must come exclusively from the VALIDATED_PALETTE below. Every
// hue in it was chosen so it can never be mistaken for a data-series or
// reference color used by the charts:
//
//   Data-series / reference colors that are off-limits (24-Hour chart,
//   Longitudinal Safety charts, Carpet Heatmap scale):
//     blues      #2563eb #3b82f6 #1d4ed8  (baselines, body battery)
//     indigo     #6366f1                 (sleep band / wake & bedtime markers)
//     sky        #0284c7                 (HRV series)
//     violet     #7c3aed                 (caffeine marker)
//     ambers     #f59e0b #d97706 #b45309 (dose PK windows, HRV split)
//     emeralds   #10b981 #059669 #047857 (workout bands/series, balanced band)
//     roses/reds #e11d48 #be123c         (seated HR series, side effects)
//     slates     #475569 #64748b #94a3b8 (axes, grid, midnight separator)
//
//   The palette therefore lives strictly in the free hue ranges:
//     teal/aqua (~170–175°), violet→purple (~275–285°),
//     fuchsia/plum (~290–305°) and pink/raspberry (~330–340°),
//   each kept a safe distance from the occupied hues and lightness levels
//   listed above.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegimenSwatch {
  hex: string;
  name: string;
}

// Rendered as a 3×3 grid in the settings modal. Keep the grid arrangement
// (cool → warm, row by row) so the picker feels ordered.
export const REGIMEN_PALETTE: readonly RegimenSwatch[] = [
  { hex: '#0d9488', name: 'Teal' },      // 1
  { hex: '#14b8a6', name: 'Aqua' },      // 2
  { hex: '#6b21a8', name: 'Violet' },    // 3
  { hex: '#9333ea', name: 'Purple' },    // 4
  { hex: '#d946ef', name: 'Orchid' },    // 5
  { hex: '#c026d3', name: 'Fuchsia' },   // 6
  { hex: '#a21caf', name: 'Plum' },      // 7
  { hex: '#be185d', name: 'Raspberry' }, // 8
  { hex: '#ec4899', name: 'Pink' },      // 9
] as const;

const REGIMEN_COLOR_SET = new Set(REGIMEN_PALETTE.map((c) => c.hex.toLowerCase()));

export const REGIMEN_PALETTE_SIZE = REGIMEN_PALETTE.length;

// Used when no explicit choice has been made yet (new regimen form).
export const DEFAULT_REGIMEN_COLOR = '#9333ea'; // Purple

// Canonical colors of the two built-in regimens. These match the colors seeded
// in demoData.ts so the stores, settings modal, plots and comparison tab all
// agree with each other.
export const DEFAULT_PRE_TREATMENT_COLOR = '#9333ea';      // Purple
export const DEFAULT_CURRENT_TREATMENT_COLOR = '#ec4899';  // Pink

// Colors that may exist in old Firestore documents (periods saved before the
// palette existed, or handed out by the old fallback shading palette). They are
// resolved to their closest validated palette color on display.
const LEGACY_COLOR_MAP: Record<string, string> = {
  '#8b5cf6': '#9333ea', // violet-500  → Purple
  '#a855f7': '#9333ea', // purple-400  → Purple
  '#7c3aed': '#6b21a8', // violet-600  → Violet
  '#db2777': '#ec4899', // pink-600    → Pink
  '#f472b6': '#ec4899', // pink-400    → Pink
};

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Map any stored regimen color to a validated palette color.
 * - Exact palette colors pass through untouched.
 * - Known legacy colors resolve to their canonical successor.
 * - Anything else (e.g. a free-picked color from the old color input) resolves
 *   deterministically to a palette slot derived from `seed` (use the era id so
 *   it stays stable across renders).
 */
export function resolveRegimenColor(color: string | undefined | null, seed: string): string {
  const c = (color || '').trim().toLowerCase();
  if (REGIMEN_COLOR_SET.has(c)) return c;
  const legacy = LEGACY_COLOR_MAP[c];
  if (legacy) return legacy;
  return REGIMEN_PALETTE[hashSeed(seed || c) % REGIMEN_PALETTE_SIZE].hex;
}

/**
 * Same as resolveRegimenColor, but guarantees the returned color is not
 * already in `used` (adding it there). Used where several regimens are shown
 * in one chart so two eras never share a shading color.
 */
export function resolveUniqueRegimenColor(
  color: string | undefined | null,
  seed: string,
  used: Set<string>
): string {
  const resolved = resolveRegimenColor(color, seed);
  const start = Math.max(
    0,
    REGIMEN_PALETTE.findIndex((c) => c.hex.toLowerCase() === resolved)
  );
  for (let i = 0; i < REGIMEN_PALETTE_SIZE; i++) {
    const candidate = REGIMEN_PALETTE[(start + i) % REGIMEN_PALETTE_SIZE].hex;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return resolved;
}

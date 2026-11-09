import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";
import { processRawDayPayload } from "./garminProcessor";
import {
  AccessConfigDoc,
  DaySummaryDoc,
  IntradayDetailsDoc,
  RawGarminDailyPayload,
  RegimenEraDoc,
} from "./types";

const DEFAULT_REGIMEN_ERAS: RegimenEraDoc[] = [
  {
    id: "era-pre-treatment",
    title: "Pre-Treatment",
    startDate: "2026-08-01",
    endDate: "2026-09-21",
    isMedicated: false,
    color: "#3b82f6",
    notes: "Baseline period before starting treatment.",
  },
  {
    id: "era-treatment",
    title: "Treatment",
    startDate: "2026-09-22",
    endDate: "2099-12-31",
    isMedicated: true,
    color: "#d97706",
    notes: "Started treatment on 22/09/2026.",
  },
];

// Legacy era documents from earlier seeds — deleted so only the clean eras remain.
const LEGACY_ERA_IDS = [
  "era-unmedicated-baseline",
];

const DEFAULT_ACCESS_CONFIG: AccessConfigDoc = {
  ownerEmail: process.env.OWNER_EMAIL || "owner@example.com",
  allowedViewerEmails: process.env.DOCTOR_EMAIL ? [process.env.DOCTOR_EMAIL] : [],
  pkSettings: {
    irOnsetMinutes: 45,
    irPeakEndMinutes: 150,
    irDurationMinutes: 240,
  },
};

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  // Locate repository root (works whether executed from repo root or functions/)
  const repoRoot = fs.existsSync(path.resolve(process.cwd(), "data", "daily"))
    ? process.cwd()
    : path.resolve(__dirname, "..", "..");

  const dailyDir = path.join(repoRoot, "data", "daily");
  const outBundlePath = path.join(repoRoot, "data", "processed_seed.json");

  if (!fs.existsSync(dailyDir)) {
    throw new Error(`Daily data directory not found at ${dailyDir}`);
  }

  const files = fs
    .readdirSync(dailyDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  console.log(`Found ${files.length} daily Garmin JSON files in ${dailyDir}`);

  const summaries: Record<string, DaySummaryDoc> = {};
  const intradayByDate: Record<string, IntradayDetailsDoc> = {};

  let workoutsCount = 0;
  let carryoverCount = 0;
  let deltaHr20Count = 0;

  for (const file of files) {
    const fullPath = path.join(dailyDir, file);
    const rawText = fs.readFileSync(fullPath, "utf-8");
    const rawPayload = JSON.parse(rawText) as RawGarminDailyPayload;

    const { summary, intraday } = processRawDayPayload(rawPayload);
    summaries[summary.calendarDate] = summary;
    intradayByDate[summary.calendarDate] = intraday;

    workoutsCount += summary.workouts.length;
    if (summary.flags.lateDoseCarryoverWarning) carryoverCount++;
    if (summary.flags.deltaHrExceeds20) deltaHr20Count++;
  }

  const bundle = {
    generatedAtUTC: new Date().toISOString(),
    totalDays: files.length,
    dateRange: {
      start: files[0]?.replace(".json", "") || null,
      end: files[files.length - 1]?.replace(".json", "") || null,
    },
    stats: {
      totalWorkoutsExcluded: workoutsCount,
      daysWithLateDoseCarryoverWarning: carryoverCount,
      daysWithDeltaHrExceeds20: deltaHr20Count,
    },
    regimenEras: DEFAULT_REGIMEN_ERAS,
    days: summaries,
    intraday: intradayByDate,
  };

  fs.writeFileSync(outBundlePath, JSON.stringify(bundle, null, 2), "utf-8");
  console.log(
    `[OK] Wrote compiled seed bundle (${files.length} days, ${workoutsCount} workouts) to ${outBundlePath}`
  );

  const hasFirebaseCreds = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_CONFIG ||
      process.env.GCLOUD_PROJECT
  );

  if (isDryRun || !hasFirebaseCreds) {
    if (isDryRun) {
      console.log("[DRY-RUN] Skipping Firestore upload (--dry-run passed).");
    } else {
      console.log(
        "[INFO] No GOOGLE_APPLICATION_CREDENTIALS / GCLOUD_PROJECT detected; local seed bundle created. Set credentials to push to Firestore."
      );
    }
    return;
  }

  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  console.log("Uploading processed daily summaries & intraday details to Firestore...");
  const dates = Object.keys(summaries).sort();

  // Firestore batch limit is 500 operations; each day writes 2 docs (summary + intraday = 2 ops)
  const chunkSize = 150;
  for (let i = 0; i < dates.length; i += chunkSize) {
    const slice = dates.slice(i, i + chunkSize);
    const batch = db.batch();

    for (const d of slice) {
      const dayRef = db.collection("days").doc(d);
      const intradayRef = dayRef.collection("intraday").doc("details");
      batch.set(dayRef, summaries[d], { merge: true });
      batch.set(intradayRef, intradayByDate[d], { merge: true });
    }

    await batch.commit();
    console.log(
      `  Committed batch ${Math.floor(i / chunkSize) + 1} (${slice[0]} -> ${
        slice[slice.length - 1]
      })`
    );
  }

  // Upsert default regimen_eras and delete legacy era documents
  const eraBatch = db.batch();
  for (const era of DEFAULT_REGIMEN_ERAS) {
    eraBatch.set(db.collection("regimen_eras").doc(era.id), era, { merge: true });
  }
  for (const legacyId of LEGACY_ERA_IDS) {
    eraBatch.delete(db.collection("regimen_eras").doc(legacyId));
  }
  await eraBatch.commit();
  console.log(
    `  Upserted ${DEFAULT_REGIMEN_ERAS.length} default regimen_eras and removed ${LEGACY_ERA_IDS.length} legacy era docs.`
  );

  // Seed config/access if missing
  const accessRef = db.collection("config").doc("access");
  const accessSnap = await accessRef.get();
  if (!accessSnap.exists) {
    await accessRef.set({
      ...DEFAULT_ACCESS_CONFIG,
      lastGarminSyncUTC: new Date().toISOString(),
      lastGarminSyncStatus: `SEEDED (${dates.length} days)`,
    });
    console.log("  Initialized default config/access document.");
  }

  console.log("[DONE] Firestore seed completed.");
}

main().catch((err) => {
  console.error("Error in seedFirestore:", err);
  process.exit(1);
});

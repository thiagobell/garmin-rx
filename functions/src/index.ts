import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import { GarminPersonalAPIClient } from "./garminClient";
import { processRawDayPayload } from "./garminProcessor";
import { DaySummaryDoc } from "./types";

// Co-locate functions with the eur3 Firestore database (europe-west1 = Belgium).
setGlobalOptions({ region: "europe-west1" });

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Computes [yesterdayDateStr, todayDateStr] in Central European / Cyprus daytime window
 * using pure UTC arithmetic (+2h offset) so host OS timezone is never used.
 */
function getDefaultSyncDates(nowUtcMs: number = Date.now()): string[] {
  const refMs = nowUtcMs + 2 * 3600 * 1000;
  const todayDate = new Date(refMs);
  const yesterdayDate = new Date(refMs - 24 * 3600 * 1000);

  const fmt = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return [fmt(yesterdayDate), fmt(todayDate)];
}

/**
 * Fetches, processes, and writes one or more calendar dates to Firestore.
 */
async function syncGarminDatesToFirestore(
  dates: string[]
): Promise<{ syncedDates: string[]; summaries: DaySummaryDoc[] }> {
  const client = new GarminPersonalAPIClient();
  const syncedDates: string[] = [];
  const summaries: DaySummaryDoc[] = [];

  for (const calendarDate of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
      logger.warn(`Skipping invalid calendarDate format: ${calendarDate}`);
      continue;
    }

    logger.info(`Fetching Garmin biometric endpoints for ${calendarDate}...`);
    const rawPayload = await client.fetchDailyPayload(calendarDate);
    const { summary, intraday } = processRawDayPayload(rawPayload);

    const batch = db.batch();
    const dayRef = db.collection("days").doc(calendarDate);
    const intradayRef = dayRef.collection("intraday").doc("details");

    batch.set(dayRef, summary, { merge: true });
    batch.set(intradayRef, intraday, { merge: true });
    await batch.commit();

    syncedDates.push(calendarDate);
    summaries.push(summary);
    logger.info(
      `Synced ${calendarDate} -> HR pts: ${intraday.hrPoints.length}, HRV pts: ${intraday.hrvPoints.length}, Seated HR: ${summary.daytimeSeatedHr ?? "n/a"} bpm`
    );
  }

  const nowIso = new Date().toISOString();
  await db
    .collection("config")
    .doc("access")
    .set(
      {
        lastGarminSyncUTC: nowIso,
        lastGarminSyncStatus: `OK (${syncedDates.join(", ")})`,
      },
      { merge: true }
    );

  return { syncedDates, summaries };
}

/**
 * Scheduled Cloud Function (2nd Gen):
 * Runs twice daily at 10:00 and 22:00 Europe/Amsterdam time.
 * Always polls Yesterday + Today so the 10:00 run captures Yesterday's 22:00-24:00 window
 * plus Today's overnight sleep/HRV and morning heart rate.
 */
export const scheduledGarminSync = onSchedule(
  {
    schedule: "0 10,22 * * *",
    timeZone: "Europe/Amsterdam",
    secrets: ["GARMIN_PERSONAL_API_KEY"],
    memory: "256MiB",
    timeoutSeconds: 180,
  },
  async () => {
    const targetDates = getDefaultSyncDates();
    logger.info(
      `Starting scheduledGarminSync for Yesterday + Today: ${targetDates.join(", ")}`
    );
    try {
      const result = await syncGarminDatesToFirestore(targetDates);
      logger.info("Completed scheduledGarminSync", {
        syncedDates: result.syncedDates,
      });
    } catch (err: any) {
      logger.error("scheduledGarminSync failed", err);
      await db
        .collection("config")
        .doc("access")
        .set(
          {
            lastGarminSyncUTC: new Date().toISOString(),
            lastGarminSyncStatus: `ERROR: ${err?.message || String(err)}`,
          },
          { merge: true }
        );
      throw err;
    }
  }
);

/**
 * Callable Cloud Function (2nd Gen):
 * Triggered manually from the React PWA ("Sync Garmin Now" button).
 * Verifies the caller is authenticated and matches the Owner Gmail.
 */
export const syncGarminNow = onCall(
  {
    secrets: ["GARMIN_PERSONAL_API_KEY"],
    cors: true,
    memory: "256MiB",
    timeoutSeconds: 180,
  },
  async (request) => {
    const callerEmail = request.auth?.token?.email;
    if (!request.auth || !callerEmail) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in with Google to trigger a Garmin sync."
      );
    }

    const accessSnap = await db.collection("config").doc("access").get();
    const ownerEmail = accessSnap.get("ownerEmail");
    // Fail-closed: if config/access is missing or uninitialized, sync is disabled.
    if (!ownerEmail || !accessSnap.exists || ownerEmail === "owner@example.com") {
      throw new HttpsError(
        "permission-denied",
        "Access config missing — Garmin sync is disabled."
      );
    }
    if (ownerEmail.toLowerCase() !== callerEmail.toLowerCase()) {
      throw new HttpsError(
        "permission-denied",
        "Only the account owner can trigger a live Garmin API sync."
      );
    }

    const customDates = Array.isArray(request.data?.dates)
      ? (request.data.dates as string[]).filter(
          (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
        )
      : [];

    const targetDates =
      customDates.length > 0 ? customDates.slice(0, 14) : getDefaultSyncDates();

    logger.info(`Manual syncGarminNow triggered by ${callerEmail}`, {
      targetDates,
    });

    const { syncedDates, summaries } = await syncGarminDatesToFirestore(targetDates);

    return {
      ok: true,
      syncedDates,
      updatedAtUTC: new Date().toISOString(),
      summariesCount: summaries.length,
    };
  }
);

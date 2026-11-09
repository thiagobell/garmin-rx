# Garmin Biometrics Project Context (`context.md`)

This document is the authoritative technical and domain reference for the **GarminAnalysis** repository.

---

## 1. Golden Rules for Timezones & Chronology (CRITICAL)

1. **Garmin Slices Daily Files by Watch-Local Midnight (`00:00` to `24:00` Local Time)**:
   * Every daily file (`calendarDate: "YYYY-MM-DD"`) covers `YYYY-MM-DDT00:00:00.0` to `(YYYY-MM-DD + 1)T00:00:00.0` in **Watch-Local Time**.
   * In raw JSON, `startTimestampGMT` often shows the previous calendar date (e.g., `2026-10-19T22:00:00.0` GMT for `calendarDate: "2026-10-20"` when in `UTC+2`). **Never confuse `startTimestampGMT`'s date/hour with local time.**
2. **Never Use the Host PC's Timezone (`.astimezone()` with no args)**:
   * The user travels across timezones.
   * Always compute local time for any UTC millisecond timestamp (`utc_ms`) using the **watch-recorded offset** at that timestamp:
     $$\Delta t = \text{TimestampLocal} - \text{TimestampGMT}$$
   * Anchor sources inside every daily payload:
     * `intraday_heart_rate`: `startTimestampLocal - startTimestampGMT` and `endTimestampLocal - endTimestampGMT`
     * `user_summary`: `wellnessStartTimeLocal - wellnessStartTimeGmt`
     * `detailed_sleep`: `sleepStartTimestampLocal - sleepStartTimestampGMT` and `sleepEndTimestampLocal - sleepEndTimestampGMT`
     * `detailed_hrv.hrvReadings`: `readingTimeLocal` (already local ISO string!) vs `readingTimeGMT`
     * `body_battery.bodyBatteryActivityEvent`: explicit `timezoneOffset` (in milliseconds)
     * `activities`: `startTimeLocal` vs `startTimeGMT`
3. **Sleep & Overnight HRV Indexing vs. Intraday HR / Body Battery Indexing**:
   * **Intraday HR & Body Battery**: Strictly bounded between `00:00` and `24:00` local time of `calendarDate`.
   * **Sleep (`dailySleep`) & Overnight HRV (`hrv`)**: Indexed by **wake-up date (`calendarDate`)**. If sleep starts at `23:07` local time on Day $D-1$ and ends at `08:54` local time on Day $D$, the entire sleep & 5-minute HRV session is stored inside Day $D$'s record.
4. **Why Scheduled Cloud Polling Fetches `Yesterday + Today`**:
   * Scheduled runs happen at `10:00` and `22:00` local time.
   * The `22:00` run on Day $D$ only captures `00:00 -> 22:00` of Day $D$.
   * The `10:00` run on Day $D+1$ **must** re-fetch Day $D$ (`Yesterday`) to capture the final 2 hours (`22:00 -> 24:00` local time) of Day $D$, as well as Day $D+1$ (`Today`) for overnight sleep/HRV and morning HR.

---

## 2. System, Python & TypeScript/JS Environment Rules

1. **JavaScript / TypeScript Runtime & Package Manager**:
   * Always use **`bun`** (`%USERPROFILE%\.bun\bin\bun.exe` / `$HOME/.bun/bin/bun`). Never install or use `npm`/`node` locally; use `bun install`, `bun run`, and `bunx`.
2. **Python Package & Environment Manager**: Always use `uv` (`%USERPROFILE%\.local\bin\uv.exe` / `uv`).
3. **Official Signed Python Interpreter**:
   * `.venv` uses the official Python interpreter installed on the host machine.
   * **Windows Smart App Control / WDAC**: Unsigned third-party C-extension `.pyd` DLLs (such as `numpy`/`pandas`) are blocked by Windows Application Control policy (`ImportError: DLL load failed ... An Application Control policy has blocked this file`).
   * **Rule**: Keep local Python scripts **pure-Python** (`httpx`, `python-dotenv`, standard library `json`, `csv`, `statistics`, `datetime`).
4. **Cloud / Synced Folder File Locking**:
   * When running inside synced cloud storage directories, run scripts with:
     ```powershell
     uv run --no-sync python <script.py>
     ```
     to avoid `.venv` folder lock conflicts.

---

## 3. Garmin Connect Personal API Reference

* **Base URL**: `https://personal.connectapi.garmin.com`
* **Token Exchange**:
  * `POST /personalapitoken-service/personal-api/personal-api-key/token`
  * Header: `Authorization: ApiKey <API_KEY>` (stored in `.env` as `API_KEY` or `GARMIN_PERSONAL_API_KEY`).
  * Returns a **raw JWT string** (`eyJ...`, valid for 24 hours / 86400s), cached in `.token_cache.json`.
* **Data Endpoints Used Per Day (`data/daily/YYYY-MM-DD.json`)**:
  1. `user_summary`: `GET /usersummary-service/usersummary/daily?calendarDate=YYYY-MM-DD`
  2. `intraday_heart_rate`: `GET /wellness-service/wellness/dailyHeartRate?date=YYYY-MM-DD` (**2-minute resolution**, 720 pts/day)
  3. `detailed_hrv`: `GET /hrv-service/hrv/YYYY-MM-DD` (**5-minute resolution during sleep**, ~90–120 pts/night + personal `baseline` object)
  4. `detailed_sleep`: `GET /sleep-service/sleep/dailySleep?date=YYYY-MM-DD` (Sleep stages, `avgSleepStress`, `sleepScores`, respiration, SpO2)
  5. `body_battery`: `GET /wellness-service/wellness/bodyBattery/reports/daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
  6. `spo2`: `GET /wellness-service/wellness/daily/spo2acclimation/YYYY-MM-DD`
  7. `activities`: `GET /activitylist-service/activities/search/activities?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=100` (Recorded workouts: running, cycling, start/end local & GMT timestamps, duration, avg/max HR, HR zones, `differenceBodyBattery`, training effect).

---

## 4. Biometric & Telemetry Domain Rules

1. **Workout Exclusion for Daytime Seated HR**:
   * Recorded workouts (e.g., midday running at 150–185 bpm) + a **30-minute post-exercise cooldown window** must be **excluded** when calculating **"Daytime Seated HR"** (`09:00–17:00` local time), and shaded separately on daily charts.
2. **True Unmedicated Baseline HR**:
   * Computed from `04:00–07:00` watch-local time (asleep, pre-morning dose), alongside Garmin's `restingHeartRate`.
3. **Overnight Autonomic Recovery Split**:
   * Split overnight 5-minute `hrvReadings` into **Early-Night HRV (1st half of sleep)** vs. **Late-Night HRV (2nd half of sleep)**.
   * Flag an elevated physiological load warning when Early-Night HRV is suppressed $>25\%$ below Late-Night HRV or when `avgSleepStress >= 25`.
4. **Firebase Dashboard Architecture**:
   * Pure Firebase stack (100% TypeScript in the cloud, `uv` + Python for local CLI backup):
     * **Firestore**: Hybrid `days/{date}` summary + `days/{date}/intraday/details` + `day_logs/{date}` + `regimen_eras/{id}` + owner-only `private_notes/{date}` + `config/access`.
     * **Firebase Google Auth**: Owner Gmail + Guest Gmail allowlist in `config/access`.
     * **TypeScript Cloud Functions (`functions/`)**: Node.js 20 (2nd Gen) functions for 10:00 & 22:00 scheduled sync (`scheduledGarminSync`) + manual `syncGarminNow`, plus `scripts/seedFirestore.ts` to upload `data/daily/*.json` to Firestore.
     * **Firebase Hosting (`web/`)**: React + TypeScript + Tailwind + Recharts PWA.

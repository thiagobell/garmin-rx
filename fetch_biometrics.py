"""Download high-resolution daily Garmin biometrics (one JSON file per day) with full resume support.

Includes recorded workouts/activities (running, cycling, etc.) both in data/activities.json
and embedded inside each corresponding data/daily/YYYY-MM-DD.json file (matched by watch-local date).

Usage examples:
  # Download from August 1, 2026 to today (resumes automatically if interrupted):
  uv run --no-sync python fetch_biometrics.py --start 2026-08-01

  # Only sync/inject activities into existing daily files without re-polling daily endpoints:
  uv run --no-sync python fetch_biometrics.py --start 2026-08-01 --activities-only
"""

import argparse
import json
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from garmin_client import GarminPersonalAPIClient

DATA_DIR = Path("data")
DAILY_DIR = DATA_DIR / "daily"
DAILY_DIR.mkdir(parents=True, exist_ok=True)
ACTIVITIES_FILE = DATA_DIR / "activities.json"


def parse_date(d_str: str) -> date:
    return datetime.strptime(d_str, "%Y-%m-%d").date()


def fetch_and_index_activities(
    client: GarminPersonalAPIClient, start_date: date, end_date: date
) -> dict[str, list[dict]]:
    """Fetch all recorded workouts in the date range, save to data/activities.json, and group by local date."""
    print(f"Fetching recorded workouts/activities ({start_date} -> {end_date})...")
    activities = client.get_activities_by_date_range(start_date, end_date, limit=500)

    # Merge with any previously saved activities in data/activities.json by activityId
    existing_by_id = {}
    if ACTIVITIES_FILE.exists():
        try:
            old_list = json.loads(ACTIVITIES_FILE.read_text(encoding="utf-8"))
            if isinstance(old_list, list):
                for a in old_list:
                    if isinstance(a, dict) and a.get("activityId"):
                        existing_by_id[a["activityId"]] = a
        except Exception:
            pass

    for a in activities:
        if isinstance(a, dict) and a.get("activityId"):
            existing_by_id[a["activityId"]] = a

    merged_list = sorted(
        existing_by_id.values(),
        key=lambda x: x.get("startTimeLocal") or "",
        reverse=True,
    )
    ACTIVITIES_FILE.write_text(json.dumps(merged_list, indent=2), encoding="utf-8")

    by_local_date: dict[str, list[dict]] = defaultdict(list)
    for a in merged_list:
        start_local = a.get("startTimeLocal") or ""
        if len(start_local) >= 10:
            d_str = start_local[:10]
            by_local_date[d_str].append(a)

    print(f"  [OK] Saved {len(merged_list)} total workouts to {ACTIVITIES_FILE} ({len(activities)} in range)\n")
    return by_local_date


def fetch_single_day(
    client: GarminPersonalAPIClient, target_date: date, day_activities: list[dict]
) -> dict:
    """Fetch all high-resolution biometric endpoints for a single calendar date."""
    d_str = target_date.strftime("%Y-%m-%d")

    user_summary = client.get_user_summary_daily(d_str)
    intraday_hr = client.get_daily_heart_rate(d_str)
    detailed_hrv = client.get_hrv_date(d_str)
    detailed_sleep = client.get_daily_sleep(d_str)
    body_battery_list = client.get_body_battery_range(d_str, d_str)
    body_battery = (
        body_battery_list[0]
        if isinstance(body_battery_list, list) and body_battery_list
        else body_battery_list
    )
    spo2 = client.get_spo2_daily(d_str)

    return {
        "calendarDate": d_str,
        "fetchedAtUTC": datetime.now(timezone.utc).isoformat(),
        "user_summary": user_summary,
        "intraday_heart_rate": intraday_hr,
        "detailed_hrv": detailed_hrv,
        "detailed_sleep": detailed_sleep,
        "body_battery": body_battery,
        "spo2": spo2,
        "activities": day_activities,
    }


def download_range(
    start_date: date,
    end_date: date,
    force: bool = False,
    delay_sec: float = 0.2,
    activities_only: bool = False,
):
    client = GarminPersonalAPIClient()
    today = date.today()

    total_days = (end_date - start_date).days + 1
    if total_days <= 0:
        raise ValueError(f"end_date ({end_date}) must be >= start_date ({start_date})")

    # 1. Always fetch workouts for the full range first (1 fast API call)
    activities_by_date = fetch_and_index_activities(client, start_date, end_date)

    print(f"Target range: {start_date} -> {end_date} ({total_days} days)")
    print(f"Output directory: {DAILY_DIR.resolve()}\n")

    downloaded = 0
    skipped = 0
    patched_activities = 0
    failed = 0

    for i in range(total_days):
        cur_date = start_date + timedelta(days=i)
        d_str = cur_date.strftime("%Y-%m-%d")
        out_path = DAILY_DIR / f"{d_str}.json"
        tmp_path = DAILY_DIR / f"{d_str}.json.tmp"
        day_acts = activities_by_date.get(d_str, [])

        # If existing file is present and valid
        if not force and out_path.exists() and out_path.stat().st_size > 100 and (cur_date < today or activities_only):
            # Ensure "activities" key is up to date in already-downloaded files
            try:
                existing_data = json.loads(out_path.read_text(encoding="utf-8"))
                if "activities" not in existing_data or existing_data.get("activities") != day_acts:
                    existing_data["activities"] = day_acts
                    tmp_path.write_text(json.dumps(existing_data, indent=2), encoding="utf-8")
                    tmp_path.replace(out_path)
                    patched_activities += 1
                    print(
                        f"[{i+1:3d}/{total_days:3d}] [PATCHED WORKOUTS] {d_str} "
                        f"({len(day_acts)} workouts injected)"
                    )
                else:
                    skipped += 1
                    if not activities_only:
                        print(f"[{i+1:3d}/{total_days:3d}] [SKIP] {d_str} (already exists: {out_path.name})")
                continue
            except Exception:
                if activities_only:
                    continue

        if activities_only:
            continue

        try:
            day_payload = fetch_single_day(client, cur_date, day_acts)

            tmp_path.write_text(json.dumps(day_payload, indent=2), encoding="utf-8")
            tmp_path.replace(out_path)

            hr_pts = len((day_payload.get("intraday_heart_rate") or {}).get("heartRateValues") or [])
            hrv_pts = len((day_payload.get("detailed_hrv") or {}).get("hrvReadings") or [])
            slp_sec = (day_payload.get("detailed_sleep") or {}).get("sleepTimeSeconds") or 0
            slp_h = f"{slp_sec/3600:.1f}h" if slp_sec else "no sleep"
            act_str = f", Workouts: {len(day_acts)}" if day_acts else ""

            downloaded += 1
            print(
                f"[{i+1:3d}/{total_days:3d}] [SAVED] {d_str} -> {out_path.name} "
                f"(HR: {hr_pts} pts, HRV: {hrv_pts} pts, Sleep: {slp_h}{act_str})"
            )
            if delay_sec > 0 and i < total_days - 1:
                time.sleep(delay_sec)

        except KeyboardInterrupt:
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
            print(f"\n[INTERRUPTED] Stopped cleanly at {d_str}. Re-run the same command to resume.")
            break
        except Exception as e:
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
            failed += 1
            print(f"[{i+1:3d}/{total_days:3d}] [ERROR] {d_str}: {e}")

    print(
        f"\nSummary: {downloaded} downloaded, {patched_activities} patched with workouts, "
        f"{skipped} skipped (cached), {failed} failed "
        f"(Total files in {DAILY_DIR}: {len(list(DAILY_DIR.glob('*.json')))})"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Download high-resolution Garmin biometrics (one JSON file per day) with resume support."
    )
    parser.add_argument(
        "--start",
        type=str,
        default="2026-08-01",
        help="Start date in YYYY-MM-DD format (default: 2026-08-01)",
    )
    parser.add_argument(
        "--end",
        type=str,
        default=None,
        help="End date in YYYY-MM-DD format (default: today)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download all days even if daily JSON files already exist",
    )
    parser.add_argument(
        "--activities-only",
        action="store_true",
        help="Only fetch workouts and inject them into existing daily JSON files",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.2,
        help="Polite delay in seconds between days (default: 0.2s)",
    )
    args = parser.parse_args()

    start_d = parse_date(args.start)
    end_d = parse_date(args.end) if args.end else date.today()
    download_range(
        start_d,
        end_d,
        force=args.force,
        delay_sec=args.delay,
        activities_only=args.activities_only,
    )


if __name__ == "__main__":
    main()

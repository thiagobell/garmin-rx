"""Analyze downloaded Garmin biometrics for health and medication tracking.

Reads per-day JSON files from data/daily/YYYY-MM-DD.json (or falls back to
combined files in data/) and performs all time-of-day calculations strictly in
the watch-recorded local time embedded in the Garmin API payloads.
"""

import argparse
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path("data")
DAILY_DIR = DATA_DIR / "daily"


def load_daily_files(start_date: str | None = None, end_date: str | None = None) -> dict:
    """Load per-day files from data/daily/*.json into a unified structure."""
    daily_files = sorted(DAILY_DIR.glob("*.json")) if DAILY_DIR.exists() else []
    if not daily_files:
        # Fallback to legacy combined file
        files = sorted(DATA_DIR.glob("garmin_biometrics_*.json"))
        if not files:
            raise FileNotFoundError("No biometric data files found in data/daily/ or data/.")
        return json.loads(files[-1].read_text(encoding="utf-8"))

    unified = {
        "user_summaries": {},
        "intraday_heart_rate": {},
        "detailed_hrv": {},
        "detailed_sleep": {},
        "body_battery_range": [],
        "spo2": {},
    }

    for f in daily_files:
        d_str = f.stem
        if start_date and d_str < start_date:
            continue
        if end_date and d_str > end_date:
            continue
        try:
            day_obj = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue

        if day_obj.get("user_summary"):
            unified["user_summaries"][d_str] = day_obj["user_summary"]
        if day_obj.get("intraday_heart_rate"):
            unified["intraday_heart_rate"][d_str] = day_obj["intraday_heart_rate"]
        if day_obj.get("detailed_hrv"):
            unified["detailed_hrv"][d_str] = day_obj["detailed_hrv"]
        if day_obj.get("detailed_sleep"):
            unified["detailed_sleep"][d_str] = day_obj["detailed_sleep"]
        if day_obj.get("body_battery"):
            unified["body_battery_range"].append(day_obj["body_battery"])
        if day_obj.get("spo2"):
            unified["spo2"][d_str] = day_obj["spo2"]

    return unified


def format_hm(seconds: int | float | None) -> str:
    if not seconds:
        return "-"
    h = int(seconds) // 3600
    m = (int(seconds) % 3600) // 60
    return f"{h}h {m:02d}m"


def _parse_iso(ts_str: str | None) -> datetime | None:
    if not ts_str:
        return None
    clean = ts_str.split(".")[0]
    return datetime.strptime(clean, "%Y-%m-%dT%H:%M:%S")


class WatchLocalTimeResolver:
    """Resolves UTC epoch milliseconds into exact watch-recorded local datetime."""

    def __init__(self, data: dict):
        self.anchors: list[tuple[int, int]] = []
        self._build_anchors(data)

    def _add_iso_pair(self, gmt_str: str | None, local_str: str | None):
        gmt_dt = _parse_iso(gmt_str)
        loc_dt = _parse_iso(local_str)
        if gmt_dt and loc_dt:
            offset_sec = int(round((loc_dt - gmt_dt).total_seconds()))
            utc_ms = int(gmt_dt.replace(tzinfo=timezone.utc).timestamp() * 1000)
            self.anchors.append((utc_ms, offset_sec))

    def _build_anchors(self, data: dict):
        # 1a. Per-day user_summaries
        for u in (data.get("user_summaries", {}) or {}).values():
            if isinstance(u, dict):
                self._add_iso_pair(u.get("wellnessStartTimeGmt"), u.get("wellnessStartTimeLocal"))
                self._add_iso_pair(u.get("wellnessEndTimeGmt"), u.get("wellnessEndTimeLocal"))

        # 1b. Legacy daily_summaries chronology
        for d in (data.get("daily_summaries", {}) or {}).get("data", []):
            chron = d.get("wellnessChronology") or {}
            self._add_iso_pair(chron.get("startTimestampGmt"), chron.get("startTimestampLocal"))
            self._add_iso_pair(chron.get("endTimestampGmt"), chron.get("endTimestampLocal"))

        # 2. Intraday HR headers
        for hr_obj in (data.get("intraday_heart_rate", {}) or {}).values():
            if isinstance(hr_obj, dict):
                self._add_iso_pair(hr_obj.get("startTimestampGMT"), hr_obj.get("startTimestampLocal"))
                self._add_iso_pair(hr_obj.get("endTimestampGMT"), hr_obj.get("endTimestampLocal"))

        # 3. Body battery headers and explicit event timezoneOffsets
        for bb_obj in data.get("body_battery_range", []) or []:
            if isinstance(bb_obj, dict):
                self._add_iso_pair(bb_obj.get("startTimestampGMT"), bb_obj.get("startTimestampLocal"))
                self._add_iso_pair(bb_obj.get("endTimestampGMT"), bb_obj.get("endTimestampLocal"))
                for ev in bb_obj.get("bodyBatteryActivityEvent", []) or []:
                    gmt_dt = _parse_iso(ev.get("eventStartTimeGmt"))
                    tz_off_ms = ev.get("timezoneOffset")
                    if gmt_dt and tz_off_ms is not None:
                        utc_ms = int(gmt_dt.replace(tzinfo=timezone.utc).timestamp() * 1000)
                        self.anchors.append((utc_ms, int(round(tz_off_ms / 1000.0))))

        # 4. Detailed sleep start/end millisecond pairs
        for slp in (data.get("detailed_sleep", {}) or {}).values():
            if isinstance(slp, dict):
                s_gmt, s_loc = slp.get("sleepStartTimestampGMT"), slp.get("sleepStartTimestampLocal")
                e_gmt, e_loc = slp.get("sleepEndTimestampGMT"), slp.get("sleepEndTimestampLocal")
                if s_gmt and s_loc:
                    self.anchors.append((int(s_gmt), int(round((s_loc - s_gmt) / 1000.0))))
                if e_gmt and e_loc:
                    self.anchors.append((int(e_gmt), int(round((e_loc - e_gmt) / 1000.0))))

        # 5. Detailed HRV 5-minute readings
        for hrv in (data.get("detailed_hrv", {}) or {}).values():
            if isinstance(hrv, dict):
                for r in hrv.get("hrvReadings", []) or []:
                    self._add_iso_pair(r.get("readingTimeGMT"), r.get("readingTimeLocal"))

        self.anchors.sort(key=lambda x: x[0])

    def to_local_dt(self, utc_ms: int) -> datetime:
        """Convert a UTC epoch millisecond timestamp to the watch's local datetime at that moment."""
        if not self.anchors:
            return datetime.fromtimestamp(utc_ms / 1000.0, tz=timezone.utc)

        best_offset = self.anchors[0][1]
        min_dist = abs(utc_ms - self.anchors[0][0])
        for a_ms, a_off in self.anchors:
            dist = abs(utc_ms - a_ms)
            if dist <= min_dist:
                min_dist = dist
                best_offset = a_off
            elif a_ms > utc_ms:
                break

        tz = timezone(timedelta(seconds=best_offset))
        return datetime.fromtimestamp(utc_ms / 1000.0, tz=tz)


def main():
    parser = argparse.ArgumentParser(description="Analyze Garmin biometrics in watch local time.")
    parser.add_argument("--start", type=str, default=None, help="Filter start date YYYY-MM-DD")
    parser.add_argument("--end", type=str, default=None, help="Filter end date YYYY-MM-DD")
    parser.add_argument("--intraday-days", type=int, default=7, help="Number of recent days for intraday HR chart")
    args = parser.parse_args()

    data = load_daily_files(args.start, args.end)
    resolver = WatchLocalTimeResolver(data)

    user_summaries = data.get("user_summaries", {}) or {}
    legacy_summaries = {
        d["calendarDate"]: d
        for d in (data.get("daily_summaries", {}) or {}).get("data", [])
    }

    detailed_hrv = data.get("detailed_hrv", {}) or {}
    hrv_by_date = {
        h["calendarDate"]: h
        for h in (data.get("hrv_range", {}) or {}).get("hrvSummaries", [])
    }
    for d_str, h_det in detailed_hrv.items():
        if isinstance(h_det, dict) and h_det.get("hrvSummary"):
            hrv_by_date[d_str] = h_det["hrvSummary"]

    sleep_by_date = {}
    for s in data.get("sleep_summaries", []) or []:
        cdate = s.get("calendarDate") or (s.get("sleepNeed", {}) or {}).get("calendarDate")
        if cdate:
            sleep_by_date[cdate] = s
    for cdate, slp_det in (data.get("detailed_sleep", {}) or {}).items():
        if isinstance(slp_det, dict) and slp_det.get("sleepTimeSeconds"):
            sleep_by_date[cdate] = slp_det

    dates = sorted(set(user_summaries.keys()) | set(legacy_summaries.keys()) | set(hrv_by_date.keys()))

    print("=" * 112)
    print("GARMIN BIOMETRIC OVERVIEW (HEALTH & BIOMETRICS TRACKING)")
    print("=" * 112)
    header = (
        f"{'Date':<11} | {'RHR':<5} | {'Min/Max HR':<10} | {'HR Alerts':<9} | "
        f"{'HRV Night/Wk':<13} | {'HRV Status':<10} | {'Stress Avg/Max':<14} | {'BodyBat + / -':<13} | {'Sleep (Score)'}"
    )
    print(header)
    print("-" * 112)

    for d in dates:
        if d in user_summaries:
            u = user_summaries[d]
            rhr = u.get("restingHeartRate") or "-"
            min_hr = u.get("minHeartRate") or "-"
            max_hr = u.get("maxHeartRate") or "-"
            alerts = u.get("abnormalHeartRateAlertsCount") or 0
            st_avg = u.get("averageStressLevel", -1)
            st_avg_str = str(st_avg) if st_avg and st_avg > 0 else "-"
            st_max = u.get("maxStressLevel") or "-"
            bb_chg = u.get("bodyBatteryChargedValue") if u.get("bodyBatteryChargedValue") is not None else "-"
            bb_drn = u.get("bodyBatteryDrainedValue") if u.get("bodyBatteryDrainedValue") is not None else "-"
        else:
            s = legacy_summaries.get(d, {})
            hr = s.get("heartRate", {}) or {}
            st = s.get("stress", {}) or {}
            bb = s.get("bodyBattery", {}) or {}
            rhr = hr.get("restingValue", "-")
            min_hr = hr.get("minValue", "-")
            max_hr = hr.get("maxValue", "-")
            alerts = hr.get("alertCount", 0)
            st_avg = st.get("avgLevel", -1)
            st_avg_str = str(st_avg) if st_avg and st_avg > 0 else "-"
            st_max = st.get("maxLevel", "-")
            bb_chg = bb.get("chargedValue", "-")
            bb_drn = bb.get("drainedValue", "-")

        hrv = hrv_by_date.get(d, {}) or {}
        slp = sleep_by_date.get(d, {}) or {}

        hrv_night = hrv.get("lastNightAvg") or "-"
        hrv_wk = hrv.get("weeklyAvg") or "-"
        hrv_status = hrv.get("status", "-")

        slp_sec = slp.get("sleepTimeSeconds")
        slp_score = (slp.get("sleepScores", {}) or {}).get("overall", {}).get("value")
        slp_str = format_hm(slp_sec)
        if slp_score:
            slp_str += f" ({slp_score})"

        print(
            f"{d:<11} | {str(rhr):<5} | {f'{min_hr}/{max_hr}':<10} | {str(alerts):<9} | "
            f"{f'{hrv_night}/{hrv_wk} ms':<13} | {hrv_status:<10} | {f'{st_avg_str}/{st_max}':<14} | "
            f"{f'+{bb_chg}/-{bb_drn}':<13} | {slp_str}"
        )

    print("\n" + "=" * 112)
    print("SLEEP ARCHITECTURE & OVERNIGHT AUTONOMIC RECOVERY (WATCH LOCAL TIME)")
    print("=" * 112)
    print(
        f"{'Date':<11} | {'Local Window':<15} | {'Total':<8} | {'Deep':<8} | "
        f"{'REM':<8} | {'Awake':<8} | {'Slp Stress':<10} | {'Early/Late Night HRV'}"
    )
    print("-" * 112)

    for d in dates:
        slp = sleep_by_date.get(d, {}) or {}
        if not slp.get("sleepTimeSeconds"):
            continue

        s_loc_ms = slp.get("sleepStartTimestampLocal")
        e_loc_ms = slp.get("sleepEndTimestampLocal")
        if s_loc_ms and e_loc_ms:
            s_str = datetime.fromtimestamp(s_loc_ms / 1000.0, tz=timezone.utc).strftime("%H:%M")
            e_str = datetime.fromtimestamp(e_loc_ms / 1000.0, tz=timezone.utc).strftime("%H:%M")
            win_str = f"{s_str} -> {e_str}"
        else:
            win_str = "-"

        tot = format_hm(slp.get("sleepTimeSeconds"))
        deep = format_hm(slp.get("deepSleepSeconds"))
        rem = format_hm(slp.get("remSleepSeconds"))
        awake = format_hm(slp.get("awakeSleepSeconds"))
        avg_stress = slp.get("avgSleepStress")
        stress_str = f"{avg_stress:.1f}" if isinstance(avg_stress, (int, float)) else "-"

        hrv_det = detailed_hrv.get(d, {}) or {}
        readings = [r["hrvValue"] for r in (hrv_det.get("hrvReadings") or []) if r.get("hrvValue") is not None]
        if len(readings) >= 4:
            mid = len(readings) // 2
            first_half = sum(readings[:mid]) / mid
            second_half = sum(readings[mid:]) / (len(readings) - mid)
            hrv_split_str = f"{first_half:4.1f} ms -> {second_half:4.1f} ms"
        else:
            hrv_split_str = "-"

        print(
            f"{d:<11} | {win_str:<15} | {tot:<8} | {deep:<8} | "
            f"{rem:<8} | {awake:<8} | {stress_str:<10} | {hrv_split_str}"
        )

    print("\n" + "=" * 112)
    print(f"INTRADAY HEART RATE BY 2-HOUR WINDOW (WATCH LOCAL TIME - LAST {args.intraday_days} DAYS)")
    print("Shows baseline pre-dose vs daytime medication active windows vs evening recovery")
    print("=" * 112)

    intraday_hr = data.get("intraday_heart_rate", {})
    hr_dates = sorted(intraday_hr.keys())[-args.intraday_days:]
    for d in hr_dates:
        hr_obj = intraday_hr[d] or {}
        vals = hr_obj.get("heartRateValues") or []
        if not vals:
            continue

        buckets = defaultdict(list)
        for pair in vals:
            if len(pair) >= 2 and pair[1] is not None and pair[1] > 0:
                ts_ms, bpm = pair[0], pair[1]
                dt_local = resolver.to_local_dt(ts_ms)
                if dt_local.strftime("%Y-%m-%d") == d:
                    hour_bucket = (dt_local.hour // 2) * 2
                    buckets[hour_bucket].append(bpm)

        if not buckets:
            continue

        print(f"\nDate: {d} (Resting HR: {hr_obj.get('restingHeartRate', '-')} bpm)")
        for b in sorted(buckets.keys()):
            bpms = buckets[b]
            avg_bpm = sum(bpms) / len(bpms)
            max_bpm = max(bpms)
            min_bpm = min(bpms)
            bar = "#" * max(1, int((avg_bpm - 45) / 1.5))
            window_label = f"{b:02d}:00-{b+2:02d}:00"
            print(f"  {window_label} | Avg: {avg_bpm:5.1f} bpm (Min {min_bpm:3d}, Max {max_bpm:3d}) | {bar}")


if __name__ == "__main__":
    main()

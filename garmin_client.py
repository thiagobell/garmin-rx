"""Garmin Connect Personal API Client.

Authenticates using your Personal API Key and fetches biometrics relevant to
tracking health and autonomic biometrics:
- Continuous & Resting Heart Rate
- Heart Rate Variability (HRV)
- All-Day Stress & Body Battery
- Sleep Architecture (Deep, Light, REM, Awake, Sleep Score)
- Respiration & SpO2
"""

import os
import json
import time
from datetime import datetime, date, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List, Union

import httpx
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://personal.connectapi.garmin.com"
TOKEN_ENDPOINT = f"{BASE_URL}/personalapitoken-service/personal-api/personal-api-key/token"
TOKEN_CACHE_FILE = Path(".token_cache.json")


def _fmt_date(d: Union[str, date, datetime]) -> str:
    if isinstance(d, (date, datetime)):
        return d.strftime("%Y-%m-%d")
    return str(d)


class GarminPersonalAPIClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GARMIN_PERSONAL_API_KEY") or os.getenv("API_KEY")
        if not self.api_key:
            raise ValueError(
                "Garmin Personal API Key not found. Please set GARMIN_PERSONAL_API_KEY (or API_KEY) in your .env file."
            )
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0.0

    def get_access_token(self, force_refresh: bool = False) -> str:
        """Retrieve a valid 24h OAuth2 Bearer JWT token, exchanging the API key if needed."""
        if not force_refresh and self._access_token and time.time() < (self._token_expires_at - 60):
            return self._access_token

        if not force_refresh and TOKEN_CACHE_FILE.exists():
            try:
                cached = json.loads(TOKEN_CACHE_FILE.read_text(encoding="utf-8"))
                if cached.get("expires_at", 0) > (time.time() + 60) and cached.get("access_token"):
                    self._access_token = cached["access_token"]
                    self._token_expires_at = cached["expires_at"]
                    return self._access_token
            except Exception:
                pass

        headers = {"Authorization": f"ApiKey {self.api_key}"}
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(TOKEN_ENDPOINT, headers=headers)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Failed to obtain token from Garmin API (Status {resp.status_code}): {resp.text}"
                )

            raw_text = resp.text.strip().strip('"')
            if raw_text.startswith("eyJ"):
                access_token = raw_text
                expires_in = 86400
            else:
                try:
                    data = resp.json()
                    access_token = data.get("access_token") or data.get("accessToken")
                    expires_in = data.get("expires_in", 86400)
                except Exception:
                    access_token = raw_text
                    expires_in = 86400

            if not access_token:
                raise RuntimeError(f"Unexpected token response payload: {resp.text}")

            self._access_token = access_token
            self._token_expires_at = time.time() + expires_in

            try:
                TOKEN_CACHE_FILE.write_text(
                    json.dumps({
                        "access_token": self._access_token,
                        "expires_at": self._token_expires_at,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }, indent=2),
                    encoding="utf-8"
                )
            except Exception:
                pass

            return self._access_token

    def _get(self, endpoint: str, params: Optional[Dict[str, Any]] = None, retries: int = 3) -> Any:
        """Helper to send authenticated GET requests to Garmin Personal API with retry/backoff."""
        token = self.get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
        url = f"{BASE_URL}{endpoint}" if endpoint.startswith("/") else f"{BASE_URL}/{endpoint}"

        for attempt in range(retries):
            try:
                with httpx.Client(timeout=30.0) as client:
                    resp = client.get(url, headers=headers, params=params)
                    if resp.status_code == 401:
                        token = self.get_access_token(force_refresh=True)
                        headers["Authorization"] = f"Bearer {token}"
                        resp = client.get(url, headers=headers, params=params)

                    if resp.status_code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                        wait_s = 2 ** (attempt + 1)
                        time.sleep(wait_s)
                        continue

                    if resp.status_code == 204 or not resp.text.strip():
                        return None

                    if resp.status_code != 200:
                        raise RuntimeError(
                            f"API request to {endpoint} failed (Status {resp.status_code}): {resp.text}"
                        )
                    return resp.json()
            except httpx.RequestError:
                if attempt < retries - 1:
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise

    # =========================================================================
    # Biometric Endpoints (from Garmin Personal API OpenAPI 3.0.1 Spec)
    # =========================================================================

    def get_daily_heart_rate(self, target_date: Union[str, date]) -> Any:
        """Returns time-series and summary heart rate data for a given date."""
        return self._get(
            "/wellness-service/wellness/dailyHeartRate",
            params={"date": _fmt_date(target_date)}
        )

    def get_heart_rate_zones(self) -> Any:
        """Returns configured heart rate zones."""
        return self._get("/biometric-service/heartRateZones/v2")

    def get_hrv_date(self, calendar_date: Union[str, date]) -> Any:
        """Get detailed HRV data (5-min readings, baseline, RMSSD) for a specific date."""
        d = _fmt_date(calendar_date)
        return self._get(f"/hrv-service/hrv/{d}")

    def get_hrv_range(self, from_date: Union[str, date], to_date: Union[str, date]) -> Any:
        """Get HRV daily summaries for a date range."""
        return self._get(f"/hrv-service/hrv/daily/{_fmt_date(from_date)}/{_fmt_date(to_date)}")

    def get_daily_sleep(self, target_date: Union[str, date]) -> Any:
        """Retrieves detailed daily sleep data (stages, epochs, score, respiration, HRV) for a date."""
        return self._get(
            "/sleep-service/sleep/dailySleep",
            params={"date": _fmt_date(target_date)}
        )

    def get_sleep_summaries_range(self, start_date: Union[str, date], end_date: Union[str, date]) -> Any:
        """Retrieves daily sleep summaries for a date range (up to 31 days)."""
        return self._get(
            "/sleep-service/sleep/dailySleepSummariesByDate",
            params={"startDate": _fmt_date(start_date), "endDate": _fmt_date(end_date)}
        )

    def get_stress_range(self, start_date: Union[str, date], end_date: Union[str, date]) -> Any:
        """Get daily stress data for a date range (up to 28 days)."""
        return self._get(
            f"/usersummary-service/stats/stress/daily/{_fmt_date(start_date)}/{_fmt_date(end_date)}"
        )

    def get_body_battery_range(self, start_date: Union[str, date], end_date: Union[str, date]) -> Any:
        """Returns daily Body Battery reports (including intraday stress/battery arrays) up to 31 days."""
        return self._get(
            "/wellness-service/wellness/bodyBattery/reports/daily",
            params={"startDate": _fmt_date(start_date), "endDate": _fmt_date(end_date)}
        )

    def get_user_summary_daily(self, calendar_date: Union[str, date]) -> Any:
        """Get full daily summary (RHR, min/max HR, stress durations, Body Battery, respiration, steps)."""
        return self._get(
            "/usersummary-service/usersummary/daily",
            params={"calendarDate": _fmt_date(calendar_date)}
        )

    def get_daily_summaries_range(self, start_date: Union[str, date], end_date: Union[str, date]) -> Any:
        """Get v2 user daily summaries for a date range (up to 1 year)."""
        return self._get(
            "/usersummary-service/v2/dailysummaries",
            params={"startDate": _fmt_date(start_date), "endDate": _fmt_date(end_date)}
        )

    def get_spo2_daily(self, calendar_date: Union[str, date]) -> Any:
        """Get SpO2 readings for a calendar date."""
        return self._get(f"/wellness-service/wellness/daily/spo2acclimation/{_fmt_date(calendar_date)}")

    def get_activities_by_date_range(
        self, start_date: Union[str, date], end_date: Union[str, date], limit: int = 200
    ) -> List[Dict[str, Any]]:
        """Get recorded workouts/activities in a date range (running, cycling, etc.)."""
        res = self._get(
            "/activitylist-service/activities/search/activities",
            params={
                "startDate": _fmt_date(start_date),
                "endDate": _fmt_date(end_date),
                "limit": limit,
            },
        )
        return res if isinstance(res, list) else []

    def get_activity_details(self, activity_id: Union[int, str]) -> Any:
        """Get detailed metadata and splits for a specific activity ID."""
        return self._get(f"/activity-service/activity/{activity_id}")

    def get_user_settings(self) -> Any:
        """Get user profile settings (sleep times, units, etc.)."""
        return self._get("/userprofile-service/userprofile/settings")

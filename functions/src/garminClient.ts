import { RawGarminDailyPayload } from "./types";

const BASE_URL = "https://personal.connectapi.garmin.com";
const TOKEN_ENDPOINT = `${BASE_URL}/personalapitoken-service/personal-api/personal-api-key/token`;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GarminPersonalAPIClient {
  private apiKey: string;
  private accessToken: string | null = null;
  private tokenExpiresAtMs = 0;

  constructor(apiKey?: string) {
    const resolvedKey =
      apiKey ||
      process.env.GARMIN_PERSONAL_API_KEY ||
      process.env.API_KEY ||
      "";
    if (!resolvedKey) {
      throw new Error(
        "GARMIN_PERSONAL_API_KEY is not configured. Provide it via Firebase Secret Manager or environment variables."
      );
    }
    this.apiKey = resolvedKey.trim();
  }

  /**
   * Exchanges the Garmin Personal API Key for a 24-hour OAuth2 Bearer JWT token.
   * Handles both raw JWT text responses ("eyJ...") and JSON token responses.
   */
  public async getAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.accessToken &&
      Date.now() < this.tokenExpiresAtMs - 60_000
    ) {
      return this.accessToken;
    }

    const resp = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${this.apiKey}`,
      },
    });

    const rawText = await resp.text();
    if (!resp.ok) {
      throw new Error(
        `Failed to obtain token from Garmin API (HTTP ${resp.status}): ${rawText}`
      );
    }

    const cleaned = rawText.trim().replace(/^"|"$/g, "");
    let token = "";
    let expiresInSec = 86400;

    if (cleaned.startsWith("eyJ")) {
      token = cleaned;
    } else {
      try {
        const parsed = JSON.parse(rawText);
        token = parsed.access_token || parsed.accessToken || "";
        if (typeof parsed.expires_in === "number") {
          expiresInSec = parsed.expires_in;
        }
      } catch {
        token = cleaned;
      }
    }

    if (!token) {
      throw new Error(`Unexpected empty token response from Garmin API: ${rawText}`);
    }

    this.accessToken = token;
    this.tokenExpiresAtMs = Date.now() + expiresInSec * 1000;
    return this.accessToken;
  }

  /**
   * Performs an authenticated GET request to the Garmin Personal API with retry/backoff.
   */
  public async get<T = any>(
    endpoint: string,
    params?: Record<string, string | number>,
    retries = 3
  ): Promise<T | null> {
    let token = await this.getAccessToken(false);
    const url = new URL(
      endpoint.startsWith("/") ? `${BASE_URL}${endpoint}` : `${BASE_URL}/${endpoint}`
    );
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        let resp = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (resp.status === 401) {
          token = await this.getAccessToken(true);
          resp = await fetch(url.toString(), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          });
        }

        if (
          [429, 500, 502, 503, 504].includes(resp.status) &&
          attempt < retries - 1
        ) {
          await sleepMs(Math.pow(2, attempt + 1) * 1000);
          continue;
        }

        if (resp.status === 204 || resp.status === 404) {
          return null;
        }

        const text = await resp.text();
        if (!text.trim()) {
          return null;
        }

        if (!resp.ok) {
          throw new Error(
            `Garmin API GET ${endpoint} failed (HTTP ${resp.status}): ${text}`
          );
        }

        return JSON.parse(text) as T;
      } catch (err) {
        if (attempt < retries - 1) {
          await sleepMs(Math.pow(2, attempt + 1) * 1000);
          continue;
        }
        throw err;
      }
    }

    return null;
  }

  /**
   * Fetches all 7 daily biometric endpoints for a single watch-local calendarDate ("YYYY-MM-DD").
   */
  public async fetchDailyPayload(calendarDate: string): Promise<RawGarminDailyPayload> {
    const [
      userSummary,
      intradayHeartRate,
      detailedHrv,
      detailedSleep,
      bodyBatteryRes,
      spo2,
      activitiesRes,
    ] = await Promise.all([
      this.get("/usersummary-service/usersummary/daily", {
        calendarDate,
      }),
      this.get("/wellness-service/wellness/dailyHeartRate", {
        date: calendarDate,
      }),
      this.get(`/hrv-service/hrv/${calendarDate}`),
      this.get("/sleep-service/sleep/dailySleep", {
        date: calendarDate,
      }),
      this.get("/wellness-service/wellness/bodyBattery/reports/daily", {
        startDate: calendarDate,
        endDate: calendarDate,
      }),
      this.get(`/wellness-service/wellness/daily/spo2acclimation/${calendarDate}`),
      this.get<any[]>("/activitylist-service/activities/search/activities", {
        startDate: calendarDate,
        endDate: calendarDate,
        limit: 100,
      }),
    ]);

    const bodyBattery =
      Array.isArray(bodyBatteryRes) && bodyBatteryRes.length > 0
        ? bodyBatteryRes[0]
        : bodyBatteryRes;

    const activities = Array.isArray(activitiesRes)
      ? activitiesRes.filter((act) => {
          const startLocal =
            typeof act?.startTimeLocal === "string" ? act.startTimeLocal : "";
          return startLocal.length >= 10
            ? startLocal.slice(0, 10) === calendarDate
            : true;
        })
      : [];

    return {
      calendarDate,
      fetchedAtUTC: new Date().toISOString(),
      user_summary: userSummary,
      intraday_heart_rate: intradayHeartRate,
      detailed_hrv: detailedHrv,
      detailed_sleep: detailedSleep,
      body_battery: bodyBattery,
      spo2,
      activities,
    };
  }
}

"""Seed Firestore directly using the logged-in Firebase CLI OAuth token and data/processed_seed.json."""

import os
import json
from pathlib import Path
import httpx
from dotenv import load_dotenv

# Load local environment variables (.env is gitignored)
load_dotenv(Path(__file__).parent / ".env")

PROJECT_ID = os.getenv("VITE_FIREBASE_PROJECT_ID", "your-firebase-project-id")
FIRESTORE_COMMIT_URL = (
    f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents:commit"
)


def to_firestore_value(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [to_firestore_value(item) for item in v]}}
    if isinstance(v, dict):
        return {
            "mapValue": {
                "fields": {str(k): to_firestore_value(val) for k, val in v.items()}
            }
        }
    return {"stringValue": str(v)}


def make_write(doc_path: str, data: dict) -> dict:
    full_name = f"projects/{PROJECT_ID}/databases/(default)/documents/{doc_path}"
    return {
        "update": {
            "name": full_name,
            "fields": {str(k): to_firestore_value(val) for k, val in data.items()},
        }
    }


def main():
    cfg_path = Path.home() / ".config" / "configstore" / "firebase-tools.json"
    cfg = {}
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except Exception:
            cfg = {}
    token = (cfg.get("tokens") or {}).get("access_token")
    if not token:
        raise RuntimeError("No Firebase CLI access token found. Run 'firebase login' first.")

    owner_email = (
        os.getenv("OWNER_EMAIL")
        or os.getenv("VITE_OWNER_EMAIL")
        or (cfg.get("user") or {}).get("email", "")
    )

    seed_file = Path("data/processed_seed.json")
    if not seed_file.exists():
        raise FileNotFoundError(f"{seed_file} does not exist.")

    seed = json.loads(seed_file.read_text(encoding="utf-8"))
    raw_days = seed.get("days", {})
    days = list(raw_days.values()) if isinstance(raw_days, dict) else raw_days
    intraday_map = seed.get("intraday", {})
    eras = seed.get("regimenEras", [])

    writes = []

    # 1. config/access
    writes.append(
        make_write(
            "config/access",
            {
                "ownerEmail": owner_email,
                "allowedViewerEmails": [],
                "pkSettings": {
                    "irOnsetMinutes": 45,
                    "irPeakEndMinutes": 150,
                    "irDurationMinutes": 240,
                },
                "lastGarminSyncUTC": seed.get("generatedAtUTC"),
                "lastGarminSyncStatus": f"OK: Seeded {len(days)} historical days (2026-08-01 -> 2026-10-21)",
            },
        )
    )

    # 2. Delete legacy era documents
    legacy_era_ids = [
        "era-unmedicated-baseline",
    ]
    for lid in legacy_era_ids:
        writes.append({
            "delete": f"projects/{PROJECT_ID}/databases/(default)/documents/regimen_eras/{lid}"
        })

    # 3. regimen_eras
    for era in eras:
        writes.append(make_write(f"regimen_eras/{era['id']}", era))

    # 4. days/{date} and days/{date}/intraday/details
    for d in days:
        cdate = d["calendarDate"]
        writes.append(make_write(f"days/{cdate}", d))
        if cdate in intraday_map:
            writes.append(
                make_write(f"days/{cdate}/intraday/details", intraday_map[cdate])
            )

    print(f"Uploading {len(writes)} documents to Firestore ({PROJECT_ID})...")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Commit in batches of 40 (since intraday docs are ~20KB each)
    batch_size = 40
    with httpx.Client(timeout=60.0) as client:
        for i in range(0, len(writes), batch_size):
            chunk = writes[i : i + batch_size]
            resp = client.post(
                FIRESTORE_COMMIT_URL, headers=headers, json={"writes": chunk}
            )
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Firestore commit failed (status {resp.status_code}): {resp.text[:500]}"
                )
            print(f"  [OK] Committed batch {i // batch_size + 1} ({min(i + batch_size, len(writes))}/{len(writes)} docs)")

    print(f"\nSuccessfully seeded all {len(days)} days + intraday curves into Firestore!")


if __name__ == "__main__":
    main()
